import json
import types

from server import app, md_converter


def test_health_ok():
    client = app.test_client()
    res = client.get("/health")
    assert res.status_code == 200
    data = res.get_json()
    assert data.get("status") == "healthy"
    assert data.get("service") == "markitdown"


def test_convert_missing_file():
    client = app.test_client()
    res = client.post("/convert")
    assert res.status_code == 400
    data = res.get_json()
    assert "No file provided" in data.get("error", "")


def test_convert_url_success_monkeypatch():
    client = app.test_client()

    original_convert = md_converter.convert

    def fake_convert(url: str):
        obj = types.SimpleNamespace()
        obj.text_content = f"Converted markdown for {url}"
        obj.title = "Example"
        return obj

    try:
        md_converter.convert = fake_convert  # type: ignore
        res = client.post(
            "/convert/url",
            data=json.dumps({"url": "https://example.com"}),
            content_type="application/json",
        )
        assert res.status_code == 200
        data = res.get_json()
        assert "markdown" in data
        assert data["metadata"].get("title") == "Example"
    finally:
        md_converter.convert = original_convert  # type: ignore


def test_convert_url_failure_monkeypatch():
    client = app.test_client()

    original_convert = md_converter.convert

    def fake_convert_fail(url: str):
        raise RuntimeError("conversion failed")

    try:
        md_converter.convert = fake_convert_fail  # type: ignore
        res = client.post(
            "/convert/url",
            data=json.dumps({"url": "https://example.com"}),
            content_type="application/json",
        )
        assert res.status_code == 500
        data = res.get_json()
        assert data.get("error") == "URL conversion failed"
    finally:
        md_converter.convert = original_convert  # type: ignore
