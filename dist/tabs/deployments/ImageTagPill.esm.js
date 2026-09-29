import { jsxs, jsx } from 'react/jsx-runtime';
import { makeStyles } from '@material-ui/core/styles';
import { fontMono } from '../../brand/tokens.esm.js';
import { slugHue } from '../../PipelineRunList.esm.js';

const useStyles = makeStyles(() => ({
  wrap: { display: "inline-flex", alignItems: "center", gap: 6, fontFamily: fontMono, minWidth: 0 },
  tag: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  slug: {
    display: "inline-block",
    flexShrink: 0,
    fontSize: 10,
    padding: "1px 7px",
    borderRadius: 8,
    border: "1px solid"
  }
}));
function NicknameChip({ nickname }) {
  const classes = useStyles();
  return /* @__PURE__ */ jsx(
    "span",
    {
      className: classes.slug,
      style: {
        color: `hsl(${slugHue(nickname)}, 65%, 60%)`,
        borderColor: `hsl(${slugHue(nickname)}, 65%, 60%)`,
        backgroundColor: `hsla(${slugHue(nickname)}, 65%, 60%, 0.12)`
      },
      children: nickname
    }
  );
}
function ImageTagPill({
  tag,
  nickname,
  size = "normal"
}) {
  const classes = useStyles();
  return /* @__PURE__ */ jsxs("span", { className: classes.wrap, style: { fontSize: size === "small" ? 10.5 : void 0 }, children: [
    /* @__PURE__ */ jsx("span", { className: classes.tag, children: tag }),
    nickname && /* @__PURE__ */ jsx(NicknameChip, { nickname })
  ] });
}

export { ImageTagPill, NicknameChip };
//# sourceMappingURL=ImageTagPill.esm.js.map
