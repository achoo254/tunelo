# ADR-0000: <Tiêu đề ngắn của quyết định>

- **Ngày:** YYYY-MM-DD
- **Trạng thái:** Đề xuất | Đã chốt | Đã thay thế bởi ADR-XXXX | Bãi bỏ
- **Người quyết định:** <tên / dattqh, hoangnh...>

## Bối cảnh

Vấn đề / tình huống gì khiến phải ra quyết định? Ràng buộc thực tế (kỹ thuật, nghiệp vụ, hạ tầng) là gì? Viết đủ để **6 tháng sau hoặc người khác pull code về** vẫn hiểu mà không cần hỏi.

## Quyết định

Chọn cái gì. Một câu rõ ràng, không vòng vo.

## Lý do (tại sao) — phần quan trọng nhất

Vì sao chọn cái này. Đây chính là thứ git diff / code không tự nói ra được. Liệt kê các lý do cụ thể, cite ràng buộc thật.

## Đánh đổi & hệ quả

- Được gì.
- Mất gì / nợ kỹ thuật chấp nhận.
- Ảnh hưởng tới phần nào của hệ thống.

## Phương án đã cân nhắc (tùy chọn)

- **Phương án B:** … — loại vì …
- **Phương án C:** … — loại vì …

---

> **Cách dùng:** Copy file này thành `NNNN-<slug-mo-ta>.md` (NNNN tăng dần: 0001, 0002…). Slug đặt theo nội dung quyết định, **KHÔNG** đặt theo số phase / mã plan (vì plan sẽ bị đổi tên/biến mất, còn quyết định thì lâu dài). Mỗi quyết định một file → ít xung đột merge khi nhiều người cùng làm.
