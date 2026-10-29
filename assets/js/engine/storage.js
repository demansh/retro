const KEY_PREFIX = "retro";

export function createStore(namespace, version, defaults) {
  const key = `${KEY_PREFIX}:${namespace}:v${version}`;

  function load() {
    try {
      const raw = window.localStorage.getItem(key);
      if (!raw) {
        return { ...defaults };
      }
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? { ...defaults, ...parsed } : { ...defaults };
    } catch (error) {
      console.warn(`Unable to read ${key}`, error);
      return { ...defaults };
    }
  }

  function save(data) {
    try {
      window.localStorage.setItem(key, JSON.stringify(data));
      return true;
    } catch (error) {
      console.warn(`Unable to write ${key}`, error);
      return false;
    }
  }

  return { load, save };
}
