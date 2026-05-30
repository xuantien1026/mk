# Hướng Dẫn Sử Dụng

## Quy trình

Script được chia làm 3 bước:

1. **`nhay_size.jsx`** — Tạo bản thiết kế đã resize cho từng size. Sau đó người dùng có thể điều chỉnh thủ công trước khi chuyển sang bước 2.
2. **`nhap_ten_so.jsx`** — Nhập tên khách hàng & số cho từng size, tạo bản in hoàn chỉnh.
3. **`xep_bo_cuc_in.jsx`** — Lựa chọn thiết kế để in & nhập khổ in => máy tính tự động sắp xếp thiết kế vào khổ in theo phương án tối ưu

---

## Quy ước đặt tên trong file Illustrator thiết kế

| Tên element   | Mô tả                                              |
|---------------|----------------------------------------------------|
| `THAN_TRUOC`  | Group thiết kế mặt sau (size L gốc)                |
| `THAN_SAU`    | Group thiết kế mặt trước (size L gốc)              |
| `TAY_TRAI`    | Group thiết kế tay trái (size L gốc)               |
| `TAY_PHAI`    | Group thiết kế tay phải (size L gốc)               |
| `TEN`         | Text frame chứa tên khách hàng                     |
| `SIZE`        | Text frame chứa size                               |

---

## Quy ước đặt tên outline trong file RAPBONGDA.ai

### Cú pháp

```
{size}_{vị_trí}_{tên_kiểu}
```

### Các thành phần

| Thành phần      | Giá trị hợp lệ                                                   |
|-----------------|------------------------------------------------------------------|
| `{size}`        | `S`, `M`, `L`, `XL`, `2XL`, `3XL`, `4XL`, `5XL`, `6XL`        |
| `{vị_trí}`      | `SAU` (mặt sau), `TRUOC` (mặt trước), `TAY` (tay áo)            |
| `{tên_kiểu}` | Tên tự do, ví dụ: `KIEU1`, `KIEU2`, `SLIM`, `REGULAR`         |

### Ví dụ

Nếu có 2 kiểu dáng mặt sau:

```
S_SAU_KIEU1    M_SAU_KIEU1    L_SAU_KIEU1    ...
S_SAU_KIEU2    M_SAU_KIEU2    L_SAU_KIEU2    ...
```

Khi chạy script, người dùng chỉ cần chọn `KIEU1` hoặc `KIEU2` — script sẽ tự ghép với từng size.

---

## Cấu hình database (`shapes_db.json`)

File `shapes_db.json` nằm cùng thư mục với script. Cập nhật file này khi thêm file outline mới hoặc thêm kiểu mới.

### Cấu trúc

```json
{
    "Tên hiển thị": {
        "path": "đường dẫn tới file .ai",
        "SAU":   ["tên kiểu 1", "tên kiểu 2"],
        "TRUOC": ["tên kiểu 1"],
        "TAY":   ["tên kiểu 1"]
    }
}
```

### Ví dụ

```json
{
    "RAPBONGDA": {
        "path": "C:/Users/Admin/MK/RAPBONGDA.ai",
        "SAU":   ["KIEU1", "KIEU2"],
        "TRUOC": ["KIEU1"],
        "TAY":   ["KIEU1"]
    },
    "RAPBONGDA_SLIM": {
        "path": "C:/Users/Admin/MK/RAPBONGDA_SLIM.ai",
        "SAU":   ["SLIM1"],
        "TRUOC": ["SLIM1"],
        "TAY":   ["SLIM1"]
    }
}
```

> **Lưu ý:** Dùng dấu `/` thay cho `\` trong đường dẫn.
