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
    panel_profile = cfg.get("panel_profile", "2in06")
    backend_id = cfg.get("backend", "power_rail")
    ui_orientation = cfg.get("ui_orientation", "landscape")
    overrides = dict(cfg.get("overrides", {}))

    if panel_profile != "2in06":
        panel_profile = "2in06"

    if ui_orientation not in ("landscape", "portrait"):
        ui_orientation = "landscape"

    if backend_id == "ys4213_bwy":
        overrides.setdefault("ui_w", 248)
        overrides.setdefault("ui_h", 128)
        overrides.setdefault("visible_w", 212)
        overrides.setdefault("visible_h", 104)
        overrides.setdefault("panel_w", 104)
        overrides.setdefault("panel_h", 212)
    elif backend_id == "q_series_qsb71":
        # E2206QSB71 labels are sold as 248x128, but the controller memory
        # that actually responds is native portrait 128x248.
        overrides.setdefault("ui_w", 248)
        overrides.setdefault("ui_h", 128)
        overrides.setdefault("panel_w", 128)
        overrides.setdefault("panel_h", 248)
        overrides.setdefault("panel_rotation", "cw")
        overrides.setdefault("register_table", "fixed266")
    elif backend_id == "q_series":
        if ui_orientation == "portrait":
            overrides.setdefault("ui_w", 128)
            overrides.setdefault("ui_h", 248)
            overrides.setdefault("panel_w", 128)
            overrides.setdefault("panel_h", 248)
            overrides.setdefault("panel_rotation", "none")
        else:
            overrides.setdefault("ui_w", 248)
            overrides.setdefault("ui_h", 128)
            overrides.setdefault("panel_w", 128)
            overrides.setdefault("panel_h", 248)
            overrides.setdefault("panel_rotation", "cw")
    else:
        if ui_orientation == "portrait":
            overrides.setdefault("ui_w", 128)
            overrides.setdefault("ui_h", 248)
            overrides.setdefault("panel_w", 128)
            overrides.setdefault("panel_h", 248)
            overrides.setdefault("panel_rotation", "none")
        else:
            overrides.setdefault("ui_w", 248)
            overrides.setdefault("ui_h", 128)
            overrides.setdefault("panel_w", 128)
            overrides.setdefault("panel_h", 248)
            overrides.setdefault("panel_rotation", "cw")

    if backend_id == "ys4213_bwy":
        from vusion_2in06_backend_ys4213_bwy import Backend
        runtime_cfg = {
            "build_tag": "runtime_ys4213_bwy_{}_v1".format(ui_orientation),
            "ui_palette": str(cfg.get("ui_palette", "bwy")).lower(),
            "science_glyph_byte_mirror": bool(cfg.get("science_glyph_byte_mirror", False)),
            "science_bmp_dir": cfg.get("science_bmp_dir", "/images/fonts/science_gothic/bmp/2.06"),
            "log_path": cfg.get("log_path", "/state/vusion_2in06_runtime_ys4213_bwy_log.txt"),
            "run_path": cfg.get("run_path", "/state/vusion_2in06_runtime_ys4213_bwy_run_id.txt"),
        }
    elif backend_id == "pdi_bw":
        from vusion_2in06_backend_pdi_bw import Backend
        runtime_cfg = {
            "build_tag": "runtime_2in06_pdi_bw_{}_v1".format(ui_orientation),
            "ui_palette": str(cfg.get("ui_palette", "bw")).lower(),
            "science_glyph_byte_mirror": bool(cfg.get("science_glyph_byte_mirror", False)),
            "science_bmp_dir": cfg.get("science_bmp_dir", "/images/fonts/science_gothic/bmp/2.06"),
            "log_path": cfg.get("log_path", "/state/vusion_2in06_runtime_pdi_bw_log.txt"),
            "run_path": cfg.get("run_path", "/state/vusion_2in06_runtime_pdi_bw_run_id.txt"),
        }
    elif backend_id == "ssd":
        from vusion_2in06_backend_ssd import Backend
        runtime_cfg = {
            "build_tag": "runtime_2in06_ssd_{}_v2".format(ui_orientation),
            "ui_palette": str(cfg.get("ui_palette", "bw")).lower(),
            "science_glyph_byte_mirror": bool(cfg.get("science_glyph_byte_mirror", False)),
            "science_bmp_dir": cfg.get("science_bmp_dir", "/images/fonts/science_gothic/bmp/2.06"),
            "log_path": cfg.get("log_path", "/state/vusion_2in06_runtime_ssd_log.txt"),
            "run_path": cfg.get("run_path", "/state/vusion_2in06_runtime_ssd_run_id.txt"),
        }
    elif backend_id == "q_series":
        from vusion_2in06_backend_q_series import Backend
        runtime_cfg = {
            "build_tag": "runtime_2in06_q_series_{}_v1".format(ui_orientation),
            "ui_palette": str(cfg.get("ui_palette", "bwry")).lower(),
            "science_glyph_byte_mirror": bool(cfg.get("science_glyph_byte_mirror", False)),
            "science_bmp_dir": cfg.get("science_bmp_dir", "/images/fonts/science_gothic/bmp/2.06"),
            "log_path": cfg.get("log_path", "/state/vusion_2in06_runtime_q_series_log.txt"),
            "run_path": cfg.get("run_path", "/state/vusion_2in06_runtime_q_series_run_id.txt"),
        }
    elif backend_id == "q_series_qsb71":
        from vusion_2in06_backend_qsb71 import Backend
        runtime_cfg = {
            "build_tag": "runtime_2in06_q_series_qsb71_{}_v1".format(ui_orientation),
            "ui_palette": str(cfg.get("ui_palette", "bwry")).lower(),
            "science_glyph_byte_mirror": bool(cfg.get("science_glyph_byte_mirror", False)),
            "science_bmp_dir": cfg.get("science_bmp_dir", "/images/fonts/science_gothic/bmp/2.06"),
            "log_path": cfg.get("log_path", "/state/vusion_2in06_runtime_qsb71_log.txt"),
            "run_path": cfg.get("run_path", "/state/vusion_2in06_runtime_qsb71_run_id.txt"),
        }
    else:
        from vusion_2in06_backend_power_rail import Backend
        runtime_cfg = {
            "build_tag": "runtime_2in06_power_rail_{}_v2".format(ui_orientation),
            "ui_palette": str(cfg.get("ui_palette", "bwr")).lower(),
            "science_glyph_byte_mirror": bool(cfg.get("science_glyph_byte_mirror", False)),
            "science_bmp_dir": cfg.get("science_bmp_dir", "/images/fonts/science_gothic/bmp/2.06"),
            "log_path": cfg.get("log_path", "/state/vusion_2in06_runtime_power_log.txt"),
            "run_path": cfg.get("run_path", "/state/vusion_2in06_runtime_power_run_id.txt"),
        }

    if ui_orientation == "portrait":
        from vusion_2in06_runtime import Runtime as _BaseRuntime
        from vusion_2in06_runtime_portrait import run_runtime_portrait
        backend = Backend(overrides=overrides)
        run_runtime_portrait(backend, runtime_cfg, _BaseRuntime)
        return

    from vusion_2in06_runtime import run_runtime
    backend = Backend(overrides=overrides)
    run_runtime(backend, runtime_cfg)


main()
