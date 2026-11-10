# Advanced Design Studio

The Board Design Studio adds useful design-system workflows on top of Excalidraw while preserving Excalidraw as the native canvas engine. It is available only in Board rooms.

## Included in this release

- **Layers:** inspect canvas elements, focus/select them, change stacking order, hide and lock them. Group/ungroup controls manage related selections, but the inspector is still a flat element list rather than a hierarchical layer tree.
- **Frames:** insert Desktop, Tablet, Mobile and Presentation boundary presets; frame rectangles sit behind existing artwork. Frames can be focused, renamed, locked and deleted. They are editable rectangles with Arcdraw metadata, not native responsive frame containers.
- **Components:** save a selected group as a master, insert linked instances and update default instances when the master changes. Instance properties currently expose inferred text, fill-color and visibility controls. Overrides are stored per instance.
- **Variants:** capture another selection as a named variant, insert it as an instance and edit that variant's inferred text/color/visibility properties. Variants are independent snapshots; changing the default master does not redesign every alternate variant.
- **Grouping:** group/ungroup selected canvas objects using Excalidraw group IDs. The layer list remains flat, while grouping affects canvas selection behavior.
- **Tokens:** save room-scoped color tokens and apply them to the selected elements' stroke and, where applicable, fill colors.
- **Auto layout:** distribute selected elements horizontally or vertically with a chosen gap. This is a geometric arrangement helper, not constraint-based or responsive auto layout.
- **Presentation:** open the canvas in view mode and fit the scene for presenting.

## Collaboration and persistence

Design Studio data is stored in the board's Dexie record for local rooms, included in editable export and cloud snapshots, and published in the same room Yjs document under `arcdraw.design.studio.v1`. Canvas changes continue through the normal Excalidraw scene sync.

## Not included yet

This is not a Figma replacement. The current component system is a useful linked-master/instance workflow, not a full design-system runtime. It does not yet provide native responsive constraints, flex-like responsive auto layout, hierarchical layer tree, property types beyond text/color/visibility, cross-room shared libraries, token-to-variable binding, interactive multi-screen prototype navigation, interaction timelines, branching design history or design-to-code export. The rendering/editing engine remains Excalidraw 0.18.1; a Figma-grade vector engine requires a separate architectural project.

## Manual test

1. In a Board room, open Studio and add a frame. Confirm it appears behind existing drawings.
2. Rename, focus, lock and delete a frame.
3. Select multiple elements, reorder them, hide/show and lock/unlock a layer.
4. Save a component, insert it, edit an instance text/color/visibility property, update the master and confirm default instances receive the new structure while retaining compatible overrides.
5. Capture a variant, insert it, select the inserted variant instance and confirm its inferred properties can be edited independently.
6. Select multiple shapes, group them, move/select them together, then ungroup them.
7. Create a color token and apply it to selected elements.
8. Select several shapes and test horizontal and vertical auto layout.
9. Save the room to cloud and open it in a second browser; confirm components and tokens sync.
