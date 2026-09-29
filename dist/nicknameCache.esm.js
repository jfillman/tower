const KEY_PREFIX = "hangar-tower:nickname:";
function storageKey(shortSha) {
  return `${KEY_PREFIX}${shortSha.toLowerCase()}`;
}
function recallNickname(shortSha) {
  try {
    return localStorage.getItem(storageKey(shortSha)) ?? void 0;
  } catch {
    return void 0;
  }
}
function rememberNickname(shortSha, nickname) {
  try {
    localStorage.setItem(storageKey(shortSha), nickname);
  } catch {
  }
}

export { recallNickname, rememberNickname };
//# sourceMappingURL=nicknameCache.esm.js.map
