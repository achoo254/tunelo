# Plans

Kế hoạch triển khai (feature/fix/refactor) được commit để máy khác / đồng đội pull về hiểu được **đang làm gì** và **tại sao**.

## Quy ước: scope theo user

Mỗi người làm trong thư mục riêng để không giẫm chân nhau khi merge:

```
plans/
├── dattqh/      # plan của dattqh
├── hoangnh/     # plan của hoangnh
└── README.md
```

- Mỗi feature/fix lớn → một thư mục `plans/<user>/<yymmdd>-<slug>/` hoặc một file `plans/<user>/<yymmdd>-<slug>.md`.
- Plan ghi: bối cảnh, các bước, todo, tiêu chí hoàn thành.
- **Quyết định kiến trúc lâu dài** (không chỉ cho một feature) → ghi vào `docs/decisions/` (ADR) thay vì plan, vì plan sẽ cũ đi còn quyết định thì còn giá trị tham chiếu.
