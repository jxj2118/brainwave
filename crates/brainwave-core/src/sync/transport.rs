//! Provider-neutral Git smart HTTP over rustls. Credentials exist only for the active sync call.
use super::Credentials;
use crate::{Error, Result};
use git2::transport::{Service, SmartSubtransport, SmartSubtransportStream, Transport};
use reqwest::blocking::{Client, Response};
use std::{
    cell::RefCell,
    io::{self, Read, Write},
    sync::OnceLock,
    time::Duration,
};
thread_local! {
    static CREDENTIALS:RefCell<Credentials> = RefCell::new(Credentials::default());
    static FAILURE:RefCell<Option<&'static str>> = const { RefCell::new(None) };
}
pub(crate) fn initialize() -> Result<()> {
    static INIT: OnceLock<std::result::Result<(), String>> = OnceLock::new();
    INIT.get_or_init(|| {
        // Called by Workspace::init/open before this application's first transport can be created.
        unsafe {
            for scheme in ["https", "http"] {
                git2::transport::register(scheme, |remote| {
                    let client =
                        client().map_err(|_| git2::Error::from_str("HTTP client unavailable"))?;
                    Transport::smart(
                        remote,
                        true,
                        Http {
                            client,
                            credentials: CREDENTIALS.with(|v| v.borrow().clone()),
                        },
                    )
                })
                .map_err(|e| e.to_string())?;
            }
        }
        Ok(())
    })
    .as_ref()
    .map_err(|_| Error::new("unsupportedRemote"))?;
    Ok(())
}
pub(crate) struct Session(Credentials);
impl Session {
    pub fn new(credentials: &Credentials) -> Self {
        let old = CREDENTIALS.with(|v| v.replace(credentials.clone()));
        FAILURE.with(|v| *v.borrow_mut() = None);
        Self(old)
    }
}
impl Drop for Session {
    fn drop(&mut self) {
        CREDENTIALS.with(|v| *v.borrow_mut() = std::mem::take(&mut self.0));
    }
}
pub(crate) fn failure() -> Option<&'static str> {
    FAILURE.with(|v| *v.borrow())
}
fn fail(code: &'static str) -> io::Error {
    FAILURE.with(|v| *v.borrow_mut() = Some(code));
    io::Error::other(code)
}
struct Http {
    client: Client,
    credentials: Credentials,
}
impl SmartSubtransport for Http {
    fn action(
        &self,
        url: &str,
        action: Service,
    ) -> std::result::Result<Box<dyn SmartSubtransportStream>, git2::Error> {
        let (service, advertisement) = match action {
            Service::UploadPackLs => ("upload-pack", true),
            Service::UploadPack => ("upload-pack", false),
            Service::ReceivePackLs => ("receive-pack", true),
            Service::ReceivePack => ("receive-pack", false),
        };
        Ok(Box::new(Stream {
            client: self.client.clone(),
            credentials: self.credentials.clone(),
            url: url.trim_end_matches('/').into(),
            service,
            advertisement,
            body: vec![],
            response: None,
        }))
    }
    fn close(&self) -> std::result::Result<(), git2::Error> {
        Ok(())
    }
}
struct Stream {
    client: Client,
    credentials: Credentials,
    url: String,
    service: &'static str,
    advertisement: bool,
    body: Vec<u8>,
    response: Option<Response>,
}
impl Stream {
    fn request(&mut self) -> io::Result<()> {
        let body = std::mem::take(&mut self.body);
        self.response = Some(
            open(
                &self.client,
                &self.credentials,
                &self.url,
                self.service,
                self.advertisement,
                body,
                "authenticationRequired",
            )
            .map_err(fail)?,
        );
        Ok(())
    }
}
fn client() -> reqwest::Result<Client> {
    Client::builder()
        .connect_timeout(Duration::from_secs(15))
        .timeout(Duration::from_secs(90))
        .redirect(reqwest::redirect::Policy::none())
        .user_agent("git/2.0 brainwave")
        .build()
}
/// `forbidden` is the error code for HTTP 403, which means "no push permission" for receive-pack probes.
fn open(
    client: &Client,
    credentials: &Credentials,
    url: &str,
    service: &str,
    advertisement: bool,
    body: Vec<u8>,
    forbidden: &'static str,
) -> std::result::Result<Response, &'static str> {
    let path = if advertisement {
        format!("/info/refs?service=git-{service}")
    } else {
        format!("/git-{service}")
    };
    let parsed = reqwest::Url::parse(url).map_err(|_| "unsupportedRemote")?;
    if parsed.scheme() != "https"
        && !(parsed.scheme() == "http" && parsed.host_str() == Some("127.0.0.1"))
    {
        return Err("unsupportedRemote");
    }
    if !parsed.username().is_empty() || parsed.password().is_some() {
        return Err("unsupportedRemote");
    }
    let mut request = if advertisement {
        client.get(format!("{url}{path}"))
    } else {
        client
            .post(format!("{url}{path}"))
            .header(
                "Content-Type",
                format!("application/x-git-{service}-request"),
            )
            .body(body)
    };
    let expected = format!(
        "application/x-git-{service}-{}",
        if advertisement {
            "advertisement"
        } else {
            "result"
        }
    );
    request = request
        .header("Accept", &expected)
        .header("Cache-Control", "no-cache");
    if !credentials.token.is_empty() {
        request = request.basic_auth(&credentials.username, Some(&credentials.token));
    }
    let response = request.send().map_err(|_| "offline")?;
    match response.status().as_u16() {
        200 => (),
        401 => return Err("authenticationRequired"),
        403 => return Err(forbidden),
        404 | 410 => return Err("remoteMissing"),
        301 | 302 | 303 | 307 | 308 => return Err("remoteRedirect"),
        _ => return Err("remoteError"),
    }
    let content_type = response
        .headers()
        .get("Content-Type")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .split(';')
        .next()
        .unwrap_or("");
    if content_type != expected {
        return Err("unsupportedRemote");
    }
    Ok(response)
}
/// Reads both ref advertisements without fetching objects or writing refs.
/// Returns the remote default branch and whether the remote has no refs.
pub(crate) fn probe(url: &str, credentials: &Credentials) -> Result<(Option<String>, bool)> {
    let client = client().map_err(|_| Error::new("remoteError"))?;
    let url = url.trim_end_matches('/');
    let fetch = |service: &str, forbidden: &'static str| {
        let response = open(&client, credentials, url, service, true, vec![], forbidden)
            .map_err(Error::new)?;
        let mut bytes = vec![];
        response
            .take(4 * 1024 * 1024)
            .read_to_end(&mut bytes)
            .map_err(|_| Error::new("offline"))?;
        Ok::<_, Error>(bytes)
    };
    let upload = fetch("upload-pack", "authenticationRequired")?;
    let result = advertisement(&upload).ok_or_else(|| Error::new("unsupportedRemote"))?;
    fetch("receive-pack", "pushDenied")?;
    Ok(result)
}
fn advertisement(bytes: &[u8]) -> Option<(Option<String>, bool)> {
    let mut rest = bytes;
    let mut lines = vec![];
    while !rest.is_empty() {
        let len = usize::from_str_radix(std::str::from_utf8(rest.get(..4)?).ok()?, 16).ok()?;
        if len == 0 {
            lines.push(None);
            rest = &rest[4..];
            continue;
        }
        if len < 4 || len > rest.len() {
            return None;
        }
        lines.push(Some(&rest[4..len]));
        rest = &rest[len..];
    }
    let mut lines = lines.into_iter().peekable();
    if matches!(lines.peek(), Some(Some(l)) if l.starts_with(b"# service=")) {
        lines.next();
        if matches!(lines.peek(), Some(None)) {
            lines.next();
        }
    }
    let Some(Some(first)) = lines.next() else {
        return Some((None, true));
    };
    let first = std::str::from_utf8(first).ok()?.trim_end_matches('\n');
    let (reference, capabilities) = first.split_once('\0').unwrap_or((first, ""));
    let oid = reference.split(' ').next()?;
    if oid.bytes().all(|b| b == b'0') {
        return Some((None, true));
    }
    let branch = capabilities
        .split(' ')
        .find_map(|c| c.strip_prefix("symref=HEAD:refs/heads/"))
        .map(str::to_owned);
    Some((branch, false))
}
impl Read for Stream {
    fn read(&mut self, out: &mut [u8]) -> io::Result<usize> {
        if self.response.is_none() {
            self.request()?;
        }
        self.response
            .as_mut()
            .unwrap()
            .read(out)
            .map_err(|_| fail("offline"))
    }
}
impl Write for Stream {
    fn write(&mut self, bytes: &[u8]) -> io::Result<usize> {
        if self.body.len() + bytes.len() > 256 * 1024 * 1024 {
            return Err(fail("transferTooLarge"));
        }
        self.body.extend_from_slice(bytes);
        Ok(bytes.len())
    }
    fn flush(&mut self) -> io::Result<()> {
        Ok(())
    }
}
