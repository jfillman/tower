import { jsxs, jsx } from 'react/jsx-runtime';
import { imageTag } from './types.esm.js';

function renderNotificationDescription(description, goToImage, inlineLinkClassName) {
  const nodes = [];
  description.split("\n").filter((line) => !line.match(/^Chain: /)).forEach((line, i) => {
    if (i > 0) nodes.push("\n");
    const imageMatch = line.match(/^Image: (.+)$/);
    const repoMatch = line.match(/^Repo: (\S+) @ (\S+)$/);
    const prMatch = line.match(/^PR: (\S+)$/);
    const commitMatch = line.match(/^Commit: (\S+)$/);
    if (imageMatch) {
      const ref = imageMatch[1];
      nodes.push(
        /* @__PURE__ */ jsxs("span", { children: [
          "Image:",
          " ",
          /* @__PURE__ */ jsx(
            "button",
            {
              type: "button",
              className: inlineLinkClassName,
              onClick: () => goToImage(imageTag(ref)),
              children: ref
            }
          )
        ] }, i)
      );
    } else if (repoMatch) {
      const [, repoShort, sha] = repoMatch;
      nodes.push(
        /* @__PURE__ */ jsxs("span", { children: [
          "Repo:",
          " ",
          /* @__PURE__ */ jsxs(
            "a",
            {
              className: inlineLinkClassName,
              href: `https://github.com/${repoShort}/commit/${sha}`,
              target: "_blank",
              rel: "noopener noreferrer",
              children: [
                repoShort,
                " @ ",
                sha
              ]
            }
          )
        ] }, i)
      );
    } else if (prMatch) {
      nodes.push(
        /* @__PURE__ */ jsxs("span", { children: [
          "PR:",
          " ",
          /* @__PURE__ */ jsx(
            "a",
            {
              className: inlineLinkClassName,
              href: prMatch[1],
              target: "_blank",
              rel: "noopener noreferrer",
              children: prMatch[1]
            }
          )
        ] }, i)
      );
    } else if (commitMatch) {
      nodes.push(
        /* @__PURE__ */ jsxs("span", { children: [
          "Commit:",
          " ",
          /* @__PURE__ */ jsx(
            "a",
            {
              className: inlineLinkClassName,
              href: commitMatch[1],
              target: "_blank",
              rel: "noopener noreferrer",
              children: commitMatch[1]
            }
          )
        ] }, i)
      );
    } else {
      nodes.push(line);
    }
  });
  return nodes;
}

export { renderNotificationDescription };
//# sourceMappingURL=notificationFormatting.esm.js.map
