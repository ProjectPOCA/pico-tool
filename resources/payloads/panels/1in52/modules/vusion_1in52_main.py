import json


def _read_cfg():
    candidates = (
        "/state/poca_runtime_config.json",
        "state/poca_runtime_config.json",
        "/poca_runtime_config.json",
        "poca_runtime_config.json",
    )
    for path in candidates:
        try:
            with open(path, "r") as f:
                return json.loads(f.read())
        except Exception:
            pass
    return {}


def main():
    cfg = _read_cfg()
    panel_profile = cfg.get("panel_profile", "1in52")
    backend_id = cfg.get("backend", "bwr")
    overrides = dict(cfg.get("overrides", {}))
    if panel_profile not in ("1in52", "1in5"):
        panel_profile = "1in52"

    if backend_id in ("q_series", "qsh72"):
        from vusion_1in52_backend_q_series import Backend
        runtime_cfg = {
            "build_tag": "runtime_1in52_q_series_v1",
            "log_path": cfg.get("log_path", "/state/vusion_1in52_q_series_runtime_log.txt"),
            "run_path": cfg.get("run_path", "/state/vusion_1in52_q_series_runtime_run_id.txt"),
            "science_bmp_dir": cfg.get("science_bmp_dir", "/images/fonts/science_gothic/bmp/2.1"),
            "science_glyph_byte_mirror": bool(cfg.get("science_glyph_byte_mirror", False)),
            "teo_black_bin": cfg.get("teo_black_bin", "/images/pac/teo_blood_moon_1in5_black.bin"),
            "teo_red_bin": cfg.get("teo_red_bin", "/images/pac/teo_blood_moon_1in5_red.bin"),
            "teo_yellow_bin": cfg.get("teo_yellow_bin", "/images/pac/teo_blood_moon_1in5_yellow.bin"),
        }
    else:
        from vusion_1in52_backend_bwr import Backend
        runtime_cfg = {
            "build_tag": "runtime_1in52_bwr_v1",
            "log_path": cfg.get("log_path", "/state/vusion_1in52_bwr_runtime_log.txt"),
            "run_path": cfg.get("run_path", "/state/vusion_1in52_bwr_runtime_run_id.txt"),
            "science_bmp_dir": cfg.get("science_bmp_dir", "/images/fonts/science_gothic/bmp/2.1"),
            "science_glyph_byte_mirror": bool(cfg.get("science_glyph_byte_mirror", False)),
            "teo_black_bin": cfg.get("teo_black_bin", "/images/pac/teo_blood_moon_1in5_black.bin"),
            "teo_red_bin": cfg.get("teo_red_bin", "/images/pac/teo_blood_moon_1in5_red.bin"),
            "teo_yellow_bin": cfg.get("teo_yellow_bin", "/images/pac/teo_blood_moon_1in5_yellow.bin"),
        }

    from vusion_1in52_runtime import run_runtime
    backend = Backend(overrides=overrides)
    run_runtime(backend, runtime_cfg)


main()
