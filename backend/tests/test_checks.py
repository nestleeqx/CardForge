from app.schemas import Attribute, CardResult, SourceProduct
from app.services.checks import check_card, find_fabrications, find_forbidden
from app.services.parsing import build_source, parse_attributes, parse_table, suggest_mapping

SOURCE = SourceProduct(
    sku="UU-001",
    name="Плед вязаный",
    category="Текстиль",
    brand="Nordika",
    attributes=[
        Attribute(name="Материал", value="акрил 70%, шерсть 30%"),
        Attribute(name="Размер", value="130x170 см"),
        Attribute(name="Цвет", value="молочный"),
    ],
)


def test_fabricated_numbers_and_materials_are_caught():
    text = "Плед размером 130х170 см из акрила с шерстью. Вес 1,2 кг, есть хлопковая нить."
    assert find_fabrications(text, SOURCE) == ["1.2", "хлопок"]


def test_source_facts_are_not_flagged():
    text = "Состав: 70% акрил и 30% шерсть, размер 130 × 170 см, оттенок молочный."
    assert find_fabrications(text, SOURCE) == []


def test_forbidden_words():
    assert find_forbidden("Лучший плед — товар №1 и хит продаж") == [
        "«лучший»",
        "«№1»",
        "«хит продаж»",
    ]
    assert find_forbidden("Плед №10 в коллекции") == []


def test_card_checks_for_wb():
    card = CardResult(
        title="Плед вязаный Nordika из акрила и шерсти, крупная косичка, молочный цвет",
        description="Коротко.",
        attributes=SOURCE.attributes,
        keywords=["плед"],
    )
    codes = {(w.code, w.field) for w in check_card(card, SOURCE, "wb")}
    assert ("too_long", "title") in codes
    assert ("too_short", "description") in codes
    assert ("keywords_count", "keywords") in codes
    ozon = {(w.code, w.field) for w in check_card(card, SOURCE, "ozon")}
    assert ("too_long", "title") not in ozon


def test_parse_attributes():
    attrs = parse_attributes("Материал: хлопок; Размер — 45x45 см; потайная молния")
    assert [(a.name, a.value) for a in attrs] == [
        ("Материал", "хлопок"),
        ("Размер", "45x45 см"),
        ("Особенности", "потайная молния"),
    ]


def test_csv_semicolon_cp1251_and_mapping():
    data = "Код товара;Наименование;Производитель\nA-1;Кружка;Терракота\n".encode("cp1251")
    columns, rows = parse_table("x.csv", data, max_rows=50, max_cell=1000)
    assert columns == ["Код товара", "Наименование", "Производитель"]
    assert rows[0]["Наименование"] == "Кружка"
    mapping = suggest_mapping(columns)
    assert mapping["sku"] == "Код товара" and mapping["brand"] == "Производитель"


def test_demo_cards_have_no_fabrications():
    from app.services.demo import _demo_results, _demo_rows

    columns, rows = _demo_rows()
    mapping = suggest_mapping(columns)
    results = _demo_results()
    assert len(rows) == len(results) == 30
    for row in rows:
        source = build_source(row, mapping, extra_as_attributes=True)
        card = CardResult.model_validate(results[source.sku])
        bad = [
            w.message
            for w in check_card(card, source, "ozon")
            if w.code not in {"missing_data", "model_note"}
        ]
        assert not bad, (source.sku, bad)
