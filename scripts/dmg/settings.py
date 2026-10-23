"""Finder metadata is written directly so the layout also works on CI."""

from pathlib import Path

application = Path(defines["app"]).resolve()
assert application.name == "Brainwave.app" and application.is_dir()

format = "UDZO"
files = [str(application)]
symlinks = {"Applications": "/Applications"}
icon = str(application / "Contents/Resources/icon.icns")
background = str(Path("scripts/dmg/background.png").resolve())
icon_locations = {application.name: (176, 156), "Applications": (464, 156)}
window_rect = ((200, 160), (640, 360))
default_view = "icon-view"
show_status_bar = False
show_tab_view = False
show_toolbar = False
show_pathbar = False
show_sidebar = False
include_icon_view_settings = True
arrange_by = None
grid_offset = (0, 0)
scroll_position = (0, 0)
label_pos = "bottom"
text_size = 14
icon_size = 128
