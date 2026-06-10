# pico tool activity bootstrap — runs the loaded MicroPython Activity script.
# If the script crashes, the error is logged and the board falls back to the
# REPL so it can always be re-flashed.
import sys


def main():
    try:
        import {{ACTIVITY_MODULE}}  # noqa: F401
    except Exception as e:
        try:
            with open("/state/activity_error.txt", "w") as f:
                f.write(repr(e) + "\n")
                sys.print_exception(e, f)
        except Exception:
            pass
        sys.print_exception(e)
        # Fall through to REPL.


main()
