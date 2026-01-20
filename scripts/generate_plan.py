import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BOOKS_PATH = ROOT / "data" / "cuv_books.json"
OUTPUT_PATH = ROOT / "data" / "reading_plan_365.json"


def load_books():
    with BOOKS_PATH.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def build_chapter_list(books):
    chapters = []
    for book in books:
        for chapter in range(1, book["chapters"] + 1):
            chapters.append(
                {
                    "book_id": book["id"],
                    "book_zh": book["name_zh"],
                    "book_en": book["name_en"],
                    "chapter": chapter,
                }
            )
    return chapters


def distribute_chapters(chapters, days=365):
    total = len(chapters)
    base = total // days
    remainder = total % days
    plan = []
    index = 0
    for day in range(1, days + 1):
        size = base + (1 if day <= remainder else 0)
        plan.append(
            {
                "day": day,
                "readings": chapters[index : index + size],
            }
        )
        index += size
    return plan


def main():
    books = load_books()
    chapters = build_chapter_list(books)
    plan = distribute_chapters(chapters)
    payload = {
        "source": "Chinese Union Version (CUV)",
        "days": len(plan),
        "total_chapters": len(chapters),
        "plan": plan,
    }
    with OUTPUT_PATH.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=2)
    print(f"Wrote {OUTPUT_PATH} with {len(plan)} days.")


if __name__ == "__main__":
    main()
