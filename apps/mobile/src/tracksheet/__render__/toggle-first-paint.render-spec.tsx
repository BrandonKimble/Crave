// ─── FALSIFIER: SegmentedToggle layout-first twin (red-team F-1, 2026-08-09) ──
//
// THE CHARTER (SegmentedToggle.tsx ~258): the control's selection is NEVER
// invisible — on a cold mount (no warm seed) a layout-positioned twin paints
// the selected segment's pill on frame ONE, before any onLayout measurement.
//
// THE DEFECT this spec exists to keep dead: the twin's cells used to be EMPTY
// Views (flexGrow:0, flexShrink:1, minWidth:0 — intrinsic width 0), so the
// frame-1 pill rendered as a 0-wide box and the twin was inert. The fix makes
// each twin cell render the SAME invisible measuring label inside the SAME
// `styles.option` box the real row uses, so twin cell width equals the real
// segment width BY CONSTRUCTION (same content, same style OBJECT — the
// assertions below check style identity, not copied values).
//
// No onLayout is ever dispatched here, so the tree under assertion IS the
// first commit's — exactly the frame the charter is about.
//
// RED-PROVEN BY MUTATION (executed 2026-08-09):
//   M-T1 twin cells emptied (the pre-fix shape: pill only, no measuring
//        content) -> 2 RED (no width-source cells; selected cell has no
//        option-box sibling).
//   M-T2 twin inner box styled with a COPIED literal instead of styles.option
//        -> 1 RED (style identity check — copied constants drift).

import React from 'react';
import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';

jest.mock('react-native-gesture-handler', () => ({
  GestureDetector: (props: { children?: unknown }) => props.children,
}));
jest.mock('../../toggles/toggle-press-gesture', () => ({
  buildTogglePressGesture: () => ({}),
}));

import { SegmentedToggle } from '../../components/SegmentedToggle';

type Node = ReturnType<ReactTestRenderer['root']['findAll']> extends (infer T)[] ? T : never;

type StyleEntry =
  | { opacity?: number; position?: string; left?: number; right?: number; backgroundColor?: string }
  | null
  | undefined;
const flat = (style: unknown): StyleEntry[] =>
  (Array.isArray(style) ? style.flat(4) : [style]) as StyleEntry[];

describe('SegmentedToggle — the frame-1 twin pill has real width by construction', () => {
  const mount = async (): Promise<ReactTestRenderer> => {
    let renderer: ReactTestRenderer | null = null;
    await act(async () => {
      renderer = TestRenderer.create(
        <SegmentedToggle
          options={[
            { label: 'Live', value: 'live' },
            { label: 'Results', value: 'results' },
          ]}
          value="results"
          onChange={() => undefined}
        />
      );
    });
    return renderer as unknown as ReactTestRenderer;
  };

  it('cold mount: every twin cell carries the SAME measuring label in the SAME styles.option box as the real row (width equality by construction, not constants)', async () => {
    const tree = await mount();
    // The real label cells are the Views that carry onLayout; their style is
    // THE `styles.option` object (StyleSheet.create is identity in this lane).
    const realCells = tree.root.findAll(
      (node: Node) => node.type === 'View' && typeof node.props.onLayout === 'function'
    );
    expect(realCells).toHaveLength(2);
    const optionStyle = realCells[0]!.props.style;
    expect(realCells[1]!.props.style).toBe(optionStyle);

    // The twin's width-source boxes: the SAME style object, WITHOUT onLayout.
    // Style IDENTITY is the falsifier — a copied literal would drift (M-T2).
    const twinBoxes = tree.root.findAll(
      (node: Node) =>
        node.type === 'View' && node.props.style === optionStyle && node.props.onLayout == null
    );
    expect(twinBoxes).toHaveLength(2);

    // Each twin box renders the option's label through the same measuring
    // style pair the real cell measures with (same Text metrics -> same width).
    const realMeasureStyle = flat(
      realCells[0]!
        .findAllByType('Text')
        .find((text) => flat(text.props.style).some((s) => s?.opacity === 0))!.props.style
    );
    const labels = twinBoxes.map((box) => {
      const texts = box.findAllByType('Text');
      expect(texts).toHaveLength(1);
      const twinStyle = flat(texts[0]!.props.style);
      // Same style OBJECTS (label + labelMeasure), not equal-looking copies.
      realMeasureStyle.forEach((entry) => expect(twinStyle).toContain(entry));
      return texts[0]!.props.children;
    });
    expect(labels).toEqual(['Live', 'Results']);

    await act(async () => {
      tree.unmount();
    });
  });

  it("cold mount: exactly ONE twin pill, and it lives in the SELECTED label's cell — so frame 1 shows the selection at that cell's width", async () => {
    const tree = await mount();
    // The twin pill is the absolute-fill View carrying the accent background
    // inside the twin row (the animated highlight is a Reanimated view).
    const pills = tree.root.findAll(
      (node: Node) =>
        node.type === 'View' &&
        flat(node.props.style).some(
          (s) => s?.position === 'absolute' && s?.left === 0 && s?.right === 0
        ) &&
        flat(node.props.style).some((s) => typeof s?.backgroundColor === 'string') &&
        node.props.pointerEvents === 'none'
    );
    expect(pills).toHaveLength(1);
    // Its sibling width source is the SELECTED option's box: the pill's parent
    // cell must contain the 'Results' measuring label (value="results").
    const cell = pills[0]!.parent!;
    const cellTexts = cell.findAllByType('Text').map((text) => text.props.children);
    expect(cellTexts).toEqual(['Results']);
    await act(async () => {
      tree.unmount();
    });
  });
});
