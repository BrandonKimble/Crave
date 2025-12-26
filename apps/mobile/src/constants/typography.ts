export const TYPE_SCALE = {
  title: { fontSize: 22, lineHeight: 28 },
  subtitle: { fontSize: 16, lineHeight: 24, includeFontPadding: false },
  body: { fontSize: 14, lineHeight: 20 },
  caption: { fontSize: 11, lineHeight: 14 },
} as const;

export const FONT_SIZES = {
  title: TYPE_SCALE.title.fontSize,
  subtitle: TYPE_SCALE.subtitle.fontSize,
  body: TYPE_SCALE.body.fontSize,
  caption: TYPE_SCALE.caption.fontSize,
} as const;

export const LINE_HEIGHTS = {
  title: TYPE_SCALE.title.lineHeight,
  subtitle: TYPE_SCALE.subtitle.lineHeight,
  body: TYPE_SCALE.body.lineHeight,
  caption: TYPE_SCALE.caption.lineHeight,
} as const;
