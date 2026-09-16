# TODO List
Complete the following points one by one.
Make sure each point is implemented correctly before moving on to the next.
Mark with an "X" the tasks that are done.

# New features
- [ ] Add undo/redo support (keyboard shortcuts and toolbar buttons) for edits made in the explorer and editor panels.
- [ ] Add a "Preview" mode that simulates clicking through the buttons/events like an end user would, without exposing the editor UI.
- [ ] Add a search/filter box above the pages tree to quickly find a page, button, or event by name.
- [ ] Allow reordering pages, buttons, and events via drag and drop within the same list (not just moving between parents).
- [ ] Add a "Duplicate project" action next to Edit/Share/Delete in the projects modal.
- [ ] Allow replacing a page's image without losing its existing buttons (currently a new image likely detaches from old button positions; make sure this is handled gracefully or clearly warned).
- [ ] Add keyboard shortcuts for common actions (delete selected node, add button/event, save/export).
- [ ] Add a zoom/pan control for the main canvas so users can work precisely on high-resolution images.
- [ ] Add basic validation/warnings for broken references (e.g. an event pointing to a page that no longer exists).
- [ ] Add automated tests (e.g. a lightweight browser-based test runner) covering the core project/page/button/event CRUD flows and the zip import/export round trip.
