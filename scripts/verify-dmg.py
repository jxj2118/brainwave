"""Check the actual installer image, including its headless Finder layout."""

import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

from ds_store import DSStore


def verify(image):
    mount = Path(tempfile.mkdtemp(prefix="brainwave-dmg-"))
    attached = False
    try:
        subprocess.run(
            ["hdiutil", "attach", "-readonly", "-nobrowse", "-mountpoint", str(mount), str(image)],
            check=True,
            stdout=subprocess.DEVNULL,
        )
        attached = True
        application = mount / "Brainwave.app"
        assert application.is_dir(), "Application is missing from the DMG"
        assert (mount / "Applications").is_symlink(), "Applications shortcut is missing"
        assert (mount / "Applications").readlink() == Path("/Applications")
        subprocess.run(["codesign", "--verify", "--deep", "--strict", str(application)], check=True)
        assert (mount / ".DS_Store").is_file(), "DMG has no saved Finder layout"
        with DSStore.open(str(mount / ".DS_Store"), "r") as store:
            window = store["."]["bwsp"]
            icons = store["."]["icvp"]
            bounds = [int(n) for n in re.findall(r"-?\d+", window["WindowBounds"])]
            width, height = bounds[2:]
            app_x, app_y = store["Brainwave.app"]["Iloc"]
            folder_x, folder_y = store["Applications"]["Iloc"]
            assert 560 <= width <= 700 and 300 <= height <= 440, "Installer window is not compact"
            assert icons["iconSize"] >= 112, "Installer icons are too small"
            assert icons["arrangeBy"] == "none", "Finder may rearrange the installer icons"
            assert app_x < folder_x and app_y == folder_y, "Drag targets are not aligned"
            assert abs((app_x + folder_x) / 2 - width / 2) <= 8, "Icons are not horizontally centered"
            assert abs((app_y + 16) - height / 2) <= 32, "Icons are not vertically centered"
            assert not any(window.get(key, False) for key in ["ShowSidebar", "ShowToolbar", "ShowStatusBar"])
        print(f"Verified DMG: {width}×{height}, {icons['iconSize']}px icons, centered drag targets")
    finally:
        if attached:
            result = subprocess.run(
                ["hdiutil", "detach", str(mount)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
            )
            if result.returncode:
                subprocess.run(["hdiutil", "detach", "-force", str(mount)], check=True, stdout=subprocess.DEVNULL)
        shutil.rmtree(mount)


if __name__ == "__main__":
    verify(Path(sys.argv[1]).resolve())
