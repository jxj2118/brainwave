use percent_encoding::{NON_ALPHANUMERIC, percent_decode_str, utf8_percent_encode};
use pulldown_cmark::{Event, LinkType, Parser, Tag};
use std::path::{Component, Path};
pub(crate) fn encode(s: &str) -> String {
    // Unreserved URI characters remain human-readable.
    const SET: &percent_encoding::AsciiSet = &NON_ALPHANUMERIC
        .remove(b'-')
        .remove(b'_')
        .remove(b'.')
        .remove(b'~');
    utf8_percent_encode(s, SET).to_string()
}
pub(crate) fn local_target(note: &str, url: &str) -> Option<String> {
    if url.starts_with(['#', '/']) || url.contains(':') || url.contains('\\') {
        return None;
    }
    let decoded = percent_decode_str(url.split(['#', '?']).next()?)
        .decode_utf8()
        .ok()?;
    let parent = Path::new(note).parent()?;
    let mut parts = Vec::<String>::new();
    for part in parent.join(decoded.as_ref()).components() {
        match part {
            Component::Normal(v) => {
                let v = v.to_str()?;
                if v.starts_with('.') {
                    return None;
                }
                parts.push(v.into());
            }
            Component::CurDir => (),
            Component::ParentDir => {
                parts.pop()?;
            }
            _ => return None,
        }
    }
    Some(parts.join("/"))
}
fn relative(from: &str, to: &str) -> String {
    let from: Vec<_> = from.split('/').filter(|s| !s.is_empty()).collect();
    let to: Vec<_> = to.split('/').collect();
    let common = from.iter().zip(&to).take_while(|(a, b)| a == b).count();
    let mut parts = vec!["..".to_owned(); from.len() - common];
    parts.extend(to[common..].iter().map(|s| encode(s)));
    let joined = parts.join("/");
    if joined.starts_with("../") {
        joined
    } else {
        format!("./{joined}")
    }
}
pub(crate) fn rewrite(text: &str, old: &str, new: &str) -> String {
    rewrite_mapped(text, old, new, None)
}
pub(crate) fn rewrite_folder(
    text: &str,
    old: &str,
    new: &str,
    from_folder: &str,
    to_folder: &str,
) -> String {
    rewrite_mapped(text, old, new, Some((from_folder, to_folder)))
}
fn rewrite_mapped(text: &str, old: &str, new: &str, folder: Option<(&str, &str)>) -> String {
    let doc = crate::markdown::Document::parse(text);
    let body = doc.body;
    let parser = Parser::new(body);
    let mut destinations: Vec<(String, std::ops::Range<usize>, bool)> = parser
        .reference_definitions()
        .iter()
        .map(|(_, def)| (def.dest.to_string(), def.span.clone(), true))
        .collect();
    destinations.extend(
        parser
            .into_offset_iter()
            .filter_map(|(event, span)| match event {
                Event::Start(Tag::Link {
                    dest_url,
                    link_type: LinkType::Inline,
                    ..
                })
                | Event::Start(Tag::Image {
                    dest_url,
                    link_type: LinkType::Inline,
                    ..
                }) => Some((dest_url.to_string(), span, false)),
                _ => None,
            }),
    );
    let old_assets = crate::attachments::asset_path(old);
    let new_assets = crate::attachments::asset_path(new);
    let parent = Path::new(new).parent().unwrap().to_string_lossy();
    let mut edits = Vec::new();
    for (url, span, definition) in destinations {
        let Some(mut target) = local_target(old, &url) else {
            continue;
        };
        if target.starts_with(&format!("{old_assets}/")) {
            target = format!("{new_assets}{}", &target[old_assets.len()..]);
        }
        if let Some((from, to)) = folder
            && (target == from || target.starts_with(&format!("{from}/")))
        {
            target = format!("{to}{}", &target[from.len()..]);
        }
        let suffix = url.find(['#', '?']).map(|n| &url[n..]).unwrap_or("");
        let replacement = format!("{}{suffix}", relative(&parent, &target));
        if replacement == url {
            continue;
        }
        if let Some(destination) = destination_span(&body[span.clone()], definition) {
            edits.push((
                span.start + destination.start..span.start + destination.end,
                replacement,
            ));
        }
    }
    edits.sort_by_key(|(s, _)| s.start);
    edits.dedup_by_key(|(s, _)| s.start);
    let mut updated = body.to_owned();
    for (span, url) in edits.into_iter().rev() {
        updated.replace_range(span, &url);
    }
    format!("{}{}", &text[..text.len() - body.len()], updated)
}

// Locate Markdown syntax, independently of the URL's text (which can also occur in labels/titles).
fn destination_span(source: &str, definition: bool) -> Option<std::ops::Range<usize>> {
    let bytes = source.as_bytes();
    let mut i = bytes.iter().position(|b| *b == b'[')? + 1;
    let mut depth = 1;
    while i < bytes.len() {
        match bytes[i] {
            b'\\' => {
                i += 2;
                continue;
            }
            b'`' => {
                let start = i;
                while i < bytes.len() && bytes[i] == b'`' {
                    i += 1;
                }
                let ticks = &source[start..i];
                if let Some(end) = source[i..].find(ticks) {
                    i += end + ticks.len();
                }
                continue;
            }
            b'[' => depth += 1,
            b']' => {
                depth -= 1;
                if depth == 0 {
                    break;
                }
            }
            _ => (),
        }
        i += 1;
    }
    i += 1;
    if bytes.get(i).copied() != Some(if definition { b':' } else { b'(' }) {
        return None;
    }
    i += 1;
    while bytes.get(i).is_some_and(u8::is_ascii_whitespace) {
        i += 1;
    }
    let angle = bytes.get(i) == Some(&b'<');
    if angle {
        i += 1;
    }
    let start = i;
    let mut parentheses = 0;
    while i < bytes.len() {
        let b = bytes[i];
        if b == b'\\' {
            i += 2;
            continue;
        }
        if angle {
            if b == b'>' {
                return Some(start..i);
            }
        } else if b.is_ascii_whitespace() || (b == b')' && parentheses == 0) {
            return Some(start..i);
        } else if b == b'(' {
            parentheses += 1;
        } else if b == b')' {
            parentheses -= 1;
        }
        i += 1;
    }
    (!angle).then_some(start..i)
}
