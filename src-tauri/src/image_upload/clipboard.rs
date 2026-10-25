use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use sha2::{Digest, Sha256};
use std::sync::Arc;
use tauri::AppHandle;
use tauri_plugin_clipboard_manager::ClipboardExt;

#[derive(Clone)]
pub struct PreparedImage {
    pub png: Arc<Vec<u8>>,
    pub thumbnail: String,
    pub width: u32,
    pub height: u32,
    pub sequence: Option<i64>,
    pub fingerprint: Vec<u8>,
}

fn sequence() -> Option<i64> {
    #[cfg(target_os = "macos")]
    {
        Some(objc2_app_kit::NSPasteboard::generalPasteboard().changeCount() as i64)
    }
    #[cfg(not(target_os = "macos"))]
    {
        None
    }
}

pub fn encode_png(rgba: &[u8], width: u32, height: u32) -> Result<Vec<u8>, String> {
    let mut bytes = Vec::new();
    {
        let mut encoder = png::Encoder::new(&mut bytes, width, height);
        encoder.set_color(png::ColorType::Rgba);
        encoder.set_depth(png::BitDepth::Eight);
        let mut writer = encoder.write_header().map_err(|e| e.to_string())?;
        writer.write_image_data(rgba).map_err(|e| e.to_string())?;
    }
    Ok(bytes)
}

pub fn prepare(
    rgba: &[u8],
    width: u32,
    height: u32,
    sequence: Option<i64>,
) -> Result<PreparedImage, String> {
    let pixels = u64::from(width) * u64::from(height);
    if pixels == 0 || pixels > 32_000_000 || pixels * 4 != rgba.len() as u64 {
        return Err("图片尺寸无效或过大，请缩小截图范围后重试（上限 3200 万像素）".into());
    }
    let png = encode_png(rgba, width, height)?;
    if png.len() > 30 * 1024 * 1024 {
        return Err("图片超过 30 MB，请缩小截图范围后重试".into());
    }
    let ratio = (128.0 / width as f64).min(96.0 / height as f64).min(1.0);
    let tw = (width as f64 * ratio).round().max(1.0) as u32;
    let th = (height as f64 * ratio).round().max(1.0) as u32;
    let mut thumb = Vec::with_capacity((tw * th * 4) as usize);
    for y in 0..th {
        for x in 0..tw {
            let offset = (((y * height / th) * width + x * width / tw) * 4) as usize;
            thumb.extend_from_slice(&rgba[offset..offset + 4]);
        }
    }
    Ok(PreparedImage {
        png: Arc::new(png),
        thumbnail: format!(
            "data:image/png;base64,{}",
            BASE64.encode(encode_png(&thumb, tw, th)?)
        ),
        width,
        height,
        sequence,
        fingerprint: Sha256::digest(rgba).to_vec(),
    })
}

pub fn read(app: &AppHandle) -> Result<PreparedImage, String> {
    let before = sequence();
    let image = app.clipboard().read_image().map_err(|_| {
        "剪贴板里没有可读取的图片。请先截图到剪贴板，或在图片上选择“复制图片”".to_string()
    })?;
    if before != sequence() {
        return Err("读取时剪贴板发生了变化，请重新上传".into());
    }
    prepare(image.rgba(), image.width(), image.height(), before)
}

pub fn copy_if_unchanged(
    app: &AppHandle,
    image: &PreparedImage,
    path: &str,
) -> Result<bool, String> {
    if let Some(original) = image.sequence {
        if sequence() != Some(original) {
            return Ok(false);
        }
    } else {
        let Ok(current) = app.clipboard().read_image() else {
            return Ok(false);
        };
        if current.width() != image.width
            || current.height() != image.height
            || Sha256::digest(current.rgba()).as_slice() != image.fingerprint
        {
            return Ok(false);
        }
    }
    app.clipboard()
        .write_text(path)
        .map_err(|e| format!("图片已上传，但复制路径失败：{e}"))?;
    Ok(true)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn png_preserves_pixels_and_creates_preview() {
        let image = prepare(&[255, 0, 0, 255, 0, 255, 0, 128], 2, 1, Some(7)).unwrap();
        assert!(image.png.starts_with(b"\x89PNG\r\n\x1a\n"));
        let mut reader = png::Decoder::new(std::io::Cursor::new(image.png.as_slice()))
            .read_info()
            .unwrap();
        let mut decoded = vec![0; reader.output_buffer_size().unwrap()];
        reader.next_frame(&mut decoded).unwrap();
        assert_eq!(decoded, [255, 0, 0, 255, 0, 255, 0, 128]);
        assert!(image.thumbnail.starts_with("data:image/png;base64,"));
    }
    #[test]
    fn refuses_invalid_sizes() {
        assert!(prepare(&[], 0, 1, None).is_err());
        assert!(prepare(&[0; 4], 10000, 10000, None).is_err());
        assert!(prepare(&[0; 3], 1, 1, None).is_err());
    }
}
