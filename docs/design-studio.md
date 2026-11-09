# Advanced Design Studio

The Board Design Studio adds useful design-system workflows on top of Excalidraw while preserving Excalidraw as the native canvas engine. It is available only in Board rooms.

## Included in this release

- **Layers:** inspect canvas elements, focus/select them, change stacking order, hide and lock them. This is a flat element list, not a hierarchical layer tree.
- **Frames:** insert Desktop, Tablet, Mobile and Presentation boundary presets; frame rectangles sit behind existing artwork. Frames can be focused, renamed, locked and deleted. They are editable rectangles with Arcdraw metadata, not native responsive frame containers.
- **Components:** save a selected group of elements as a reusable component, insert copies, and capture another selection as a named variant. Variants are snapshots, not property-bound design variants.
- **Tokens:** save room-scoped color tokens and apply them to the selected elements' stroke and, where applicable, fill colors.
- **Auto layout:** distribute selected elements horizontally or vertically with a chosen gap. This is a geometric arrangement helper, not constraint-based or responsive auto layout.
- **Presentation:** open the canvas in view mode and fit the scene for presenting.

## Collaboration and persistence

Design Studio data is stored in the board's Dexie record for local rooms, included in editable export and cloud snapshots, and published in the same room Yjs document under `arcdraw.design.studio.v1`. Canvas changes continue through the normal Excalidraw scene sync.

## Not included yet

This is not a Figma replacement. There is no native responsive constraints engine, nested layer groups, component property panel, component overrides, token-to-variable binding, multi-screen prototype navigation, interaction timeline or design-to-code export. Those require a deeper design document model than Excalidraw's flat scene.

## Manual test

1. In a Board room, open Studio and add a frame. Confirm it appears behind existing drawings.
2. Rename, focus, lock and delete a frame.
3. Select multiple elements, reorder them, hide/show and lock/unlock a layer.
4. Save a component, insert it, capture a variant and insert that variant.
5. Create a color token and apply it to selected elements.
6. Select several shapes and test horizontal and vertical auto layout.
7. Save the room to cloud and open it in a second browser; confirm components and tokens sync.
