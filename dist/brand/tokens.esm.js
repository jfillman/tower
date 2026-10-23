import { useTheme } from '@material-ui/core/styles';

const light = {
  bg: "#F1F3F5",
  bgRaised: "#FFFFFF",
  panel: "#FFFFFF",
  panelAlt: "#E8ECEF",
  line: "#D5DBE0",
  lineSoft: "#E3E7EA",
  textHi: "#171B1F",
  textLo: "#5B6570",
  textFaint: "#88919A",
  amber: "#B9791F",
  amberFill: "#E2A03A",
  amberFillHover: "#EAAB48",
  amberFillPress: "#D4922C",
  amberText: "#7A5115",
  amberInk: "#7A5115",
  onAmber: "#1A1204",
  amberSoft: "#F4E6C9",
  amberLine: "#E0BE84",
  sky: "#2E7BA6",
  skySoft: "#DCEDF6",
  skyLine: "#B7D7E6",
  good: "#2E8B57",
  goodSoft: "#DCF0E4",
  bad: "#B23B2E",
  badSoft: "#F6DEDA"
};
const dark = {
  bg: "#0B0D10",
  bgRaised: "#12161B",
  panel: "#12161B",
  panelAlt: "#1A1F26",
  line: "#262C33",
  lineSoft: "#1D232A",
  textHi: "#E9ECEF",
  textLo: "#96A2AC",
  textFaint: "#66717B",
  amber: "#E8A33D",
  amberFill: "#E8A33D",
  amberFillHover: "#F0B04A",
  amberFillPress: "#D9922C",
  amberText: "#E8A33D",
  amberInk: "#F4C67D",
  onAmber: "#1A1204",
  amberSoft: "#3A2C15",
  amberLine: "#5C4520",
  sky: "#6FB2D9",
  skySoft: "#152530",
  skyLine: "#2C4756",
  good: "#5FAE84",
  goodSoft: "#16281F",
  bad: "#D9776A",
  badSoft: "#301A17"
};
function useHangarTokens() {
  const theme = useTheme();
  return theme.palette.type === "dark" ? dark : light;
}
const fontDisplay = '"IBM Plex Sans Condensed", "IBM Plex Sans", sans-serif';
const fontBody = '"IBM Plex Sans", -apple-system, "Segoe UI", sans-serif';
const fontMono = '"IBM Plex Mono", "SFMono-Regular", Consolas, monospace';
const fontScale = { xs: 11, sm: 12, md: 13};

export { fontBody, fontDisplay, fontMono, fontScale, useHangarTokens };
//# sourceMappingURL=tokens.esm.js.map
