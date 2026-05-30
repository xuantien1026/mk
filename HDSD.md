# Hướng Dẫn Sử Dụng

## Quy trình

Script được chia làm 2 bước:

1. **`resize_to_sizes.jsx`** — Tạo bản thiết kế đã resize cho từng size. Sau đó người dùng có thể điều chỉnh thủ công trước khi chuyển sang bước 2.
2. **`apply_names.jsx`** — Nhập tên khách hàng cho từng size, tạo bản in hoàn chỉnh.

---

## Quy ước đặt tên trong file Illustrator thiết kế

| Tên element       | Mô tả                                              |
|-------------------|----------------------------------------------------|
| `BACK_DESIGN`     | Group thiết kế mặt sau (size L gốc)               |
| `FRONT_DESIGN`    | Group thiết kế mặt trước (size L gốc)             |
| `LEFT_SLEEVE`     | Group thiết kế tay trái (size L gốc)              |
| `RIGHT_SLEEVE`    | Group thiết kế tay phải (size L gốc)              |
| `CUSTOMER_NAME`   | Text frame chứa tên khách hàng (trong BACK_DESIGN) |
| `SIZE`            | Text frame chứa size (có thể xuất hiện nhiều lần) |

---

## Quy ước đặt tên outline trong file RAPBONGDA.ai

### Cú pháp

```
{size}_{vị_trí}_{tên_variant}
```

### Các thành phần

| Thành phần      | Giá trị hợp lệ                                                   |
|-----------------|------------------------------------------------------------------|
| `{size}`        | `S`, `M`, `L`, `XL`, `2XL`, `3XL`, `4XL`, `5XL`, `6XL`        |
| `{vị_trí}`      | `BACK`, `FRONT`, `SLEEVE`                                        |
| `{tên_variant}` | Tên tự do, ví dụ: `SHAPE1`, `SHAPE2`, `SLIM`, `REGULAR`         |

### Ví dụ

Nếu có 2 kiểu dáng mặt sau:

```
S_BACK_SHAPE1    M_BACK_SHAPE1    L_BACK_SHAPE1    ...
S_BACK_SHAPE2    M_BACK_SHAPE2    L_BACK_SHAPE2    ...
```

Khi chạy script, người dùng chỉ cần chọn `SHAPE1` hoặc `SHAPE2` — script sẽ tự ghép với từng size.

---

## Cấu hình database (`shapes_db.json`)

File `shapes_db.json` nằm cùng thư mục với script. Cập nhật file này khi thêm file outline mới hoặc thêm variant mới.

### Cấu trúc

```json
{
    "Tên hiển thị": {
        "path": "đường dẫn tới file .ai",
        "BACK":   ["tên variant 1", "tên variant 2"],
        "FRONT":  ["tên variant 1"],
        "SLEEVE": ["tên variant 1"]
    }
}
```

### Ví dụ

```json
{
    "RAPBONGDA": {
        "path": "C:/Users/Admin/MK/RAPBONGDA.ai",
        "BACK":   ["SHAPE1", "SHAPE2"],
        "FRONT":  ["SHAPE1"],
        "SLEEVE": ["SHAPE1"]
    },
    "RAPBONGDA_SLIM": {
        "path": "C:/Users/Admin/MK/RAPBONGDA_SLIM.ai",
        "BACK":   ["SLIM1"],
        "FRONT":  ["SLIM1"],
        "SLEEVE": ["SLIM1"]
    }
}
```

> **Lưu ý:** Dùng dấu `/` thay cho `\` trong đường dẫn.
