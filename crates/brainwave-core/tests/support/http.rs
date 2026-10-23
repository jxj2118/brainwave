//! Test-only standard Git CGI server; production synchronization never spawns Git.
use std::{
    io::{Read, Write},
    net::TcpListener,
    path::Path,
    process::{Command, Stdio},
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
    },
    thread,
    time::Duration,
};
pub struct Server {
    pub url: String,
    stop: Arc<AtomicBool>,
    thread: Option<thread::JoinHandle<()>>,
}
impl Server {
    pub fn start(root: &Path) -> Self {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        listener.set_nonblocking(true).unwrap();
        let address = listener.local_addr().unwrap();
        let stop = Arc::new(AtomicBool::new(false));
        let stopped = stop.clone();
        let root = root.to_owned();
        let thread = thread::spawn(move || {
            while !stopped.load(Ordering::SeqCst) {
                let (mut socket, _) = match listener.accept() {
                    Ok(v) => v,
                    Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                        thread::sleep(Duration::from_millis(5));
                        continue;
                    }
                    Err(e) => panic!("{e}"),
                };
                // Accepted sockets inherit nonblocking mode on macOS.
                socket.set_nonblocking(false).unwrap();
                socket
                    .set_read_timeout(Some(Duration::from_secs(5)))
                    .unwrap();
                let mut request = vec![];
                let split = loop {
                    let mut buffer = [0; 8192];
                    let n = socket.read(&mut buffer).unwrap();
                    assert!(n > 0);
                    request.extend_from_slice(&buffer[..n]);
                    if let Some(p) = request.windows(4).position(|b| b == b"\r\n\r\n") {
                        break p + 4;
                    }
                };
                let header = String::from_utf8(request[..split].to_vec()).unwrap();
                let mut first = header.lines().next().unwrap().split_whitespace();
                let method = first.next().unwrap();
                let url = first.next().unwrap();
                let (path, query) = url.split_once('?').unwrap_or((url, ""));
                let length = header
                    .lines()
                    .find_map(|l| {
                        l.to_lowercase()
                            .strip_prefix("content-length:")
                            .and_then(|v| v.trim().parse::<usize>().ok())
                    })
                    .unwrap_or(0);
                while request.len() - split < length {
                    let mut buffer = [0; 8192];
                    let n = socket.read(&mut buffer).unwrap();
                    assert!(n > 0);
                    request.extend_from_slice(&buffer[..n]);
                }
                let content_type = header
                    .lines()
                    .find_map(|l| {
                        l.strip_prefix("content-type: ")
                            .or_else(|| l.strip_prefix("Content-Type: "))
                    })
                    .unwrap_or("");
                let mut child = Command::new("git")
                    .arg("http-backend")
                    .env("GIT_PROJECT_ROOT", &root)
                    .env("GIT_HTTP_EXPORT_ALL", "1")
                    .env("REQUEST_METHOD", method)
                    .env("PATH_INFO", path)
                    .env("QUERY_STRING", query)
                    .env("CONTENT_TYPE", content_type)
                    .env("CONTENT_LENGTH", length.to_string())
                    .env("REMOTE_USER", "writer")
                    .stdin(Stdio::piped())
                    .stdout(Stdio::piped())
                    .stderr(Stdio::null())
                    .spawn()
                    .unwrap();
                child
                    .stdin
                    .take()
                    .unwrap()
                    .write_all(&request[split..split + length])
                    .unwrap();
                let output = child.wait_with_output().unwrap();
                assert!(output.status.success());
                let at = output
                    .stdout
                    .windows(4)
                    .position(|b| b == b"\r\n\r\n")
                    .unwrap();
                let headers = std::str::from_utf8(&output.stdout[..at]).unwrap();
                let body = &output.stdout[at + 4..];
                let status = headers
                    .lines()
                    .find_map(|l| l.strip_prefix("Status: "))
                    .unwrap_or("200 OK");
                write!(
                    socket,
                    "HTTP/1.1 {status}\r\nContent-Length: {}\r\nConnection: close\r\n",
                    body.len()
                )
                .unwrap();
                for line in headers.lines().filter(|l| !l.starts_with("Status:")) {
                    write!(socket, "{line}\r\n").unwrap();
                }
                socket.write_all(b"\r\n").unwrap();
                socket.write_all(body).unwrap();
            }
        });
        Self {
            url: format!("http://{address}/remote.git"),
            stop,
            thread: Some(thread),
        }
    }
}
impl Drop for Server {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::SeqCst);
        if let Some(t) = self.thread.take() {
            t.join().unwrap();
        }
    }
}
