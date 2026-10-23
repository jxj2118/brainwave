use crate::{Error, Result};
use serde_yaml::Value;
use uuid::Uuid;

pub(crate) struct Document<'a> {
    pub body: &'a str,
    prefix: &'a str,
    pub(crate) yaml: Option<&'a str>,
    closing: &'a str,
    bom: &'a str,
    valid_header: bool,
}
impl<'a> Document<'a> {
    pub fn parse(text: &'a str) -> Self {
        let (bom, text) = if let Some(rest) = text.strip_prefix('\u{feff}') {
            ("\u{feff}", rest)
        } else {
            ("", text)
        };
        let opening = if text.starts_with("---\r\n") {
            "---\r\n"
        } else if text.starts_with("---\n") {
            "---\n"
        } else {
            ""
        };
        if !opening.is_empty() {
            let mut offset = opening.len();
            for line in text[offset..].split_inclusive('\n') {
                if matches!(line.trim_end_matches(['\r', '\n']), "---" | "...") {
                    return Self {
                        body: &text[offset + line.len()..],
                        prefix: opening,
                        yaml: Some(&text[opening.len()..offset]),
                        closing: line,
                        bom,
                        valid_header: true,
                    };
                }
                offset += line.len();
            }
            // An unterminated frontmatter block remains readable but cannot be edited safely.
            return Self {
                body: text,
                prefix: "",
                yaml: None,
                closing: "",
                bom,
                valid_header: false,
            };
        }
        Self {
            body: text,
            prefix: "",
            yaml: None,
            closing: "",
            bom,
            valid_header: true,
        }
    }
    pub fn id(&self) -> Option<String> {
        let value: Value = serde_yaml::from_str(self.yaml?).ok()?;
        value
            .get("id")?
            .as_str()
            .filter(|s| !s.is_empty())
            .map(str::to_owned)
    }
    pub fn with_body(&self, body: &str) -> Result<String> {
        if !self.valid_header {
            return Err(Error::new("invalidFrontmatter"));
        }
        if let Some(yaml) = self.yaml {
            let value: Value =
                serde_yaml::from_str(yaml).map_err(|_| Error::new("invalidFrontmatter"))?;
            if !value.is_null() && !value.is_mapping() {
                return Err(Error::new("invalidFrontmatter"));
            }
            let existing = value.get("id");
            if existing.is_some_and(|v| v.as_str().is_none_or(str::is_empty)) {
                return Err(Error::new("invalidFrontmatter"));
            }
            let mut header = yaml.to_owned();
            if existing.is_none() {
                // Keep unknown metadata byte-for-byte; unsupported YAML layouts are never reserialized.
                let first = yaml.trim_start();
                if first.starts_with('{')
                    || first.starts_with('!')
                    || first.starts_with('&')
                    || first.starts_with('*')
                    || first.starts_with('%')
                {
                    return Err(Error::new("invalidFrontmatter"));
                }
                let eol = if self.prefix.ends_with("\r\n") {
                    "\r\n"
                } else {
                    "\n"
                };
                header.push_str(&format!("id: {}{eol}", Uuid::now_v7()));
                // Validate the composed document as well, catching unusual block/indentation layouts.
                let parsed: Value =
                    serde_yaml::from_str(&header).map_err(|_| Error::new("invalidFrontmatter"))?;
                if parsed.get("id").and_then(Value::as_str).is_none() {
                    return Err(Error::new("invalidFrontmatter"));
                }
            }
            let closing = if self.closing.ends_with('\n') {
                self.closing.to_owned()
            } else {
                format!("{}\n", self.closing)
            };
            Ok(format!(
                "{}{}{}{}{}",
                self.bom, self.prefix, header, closing, body
            ))
        } else {
            let eol = if self.body.contains("\r\n") {
                "\r\n"
            } else {
                "\n"
            };
            Ok(format!(
                "{}---{eol}id: {}{eol}---{eol}{body}",
                self.bom,
                Uuid::now_v7()
            ))
        }
    }
}
