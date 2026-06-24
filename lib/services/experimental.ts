import { writable } from "svelte/store";
import type { TradeSiteVersion } from "../types/trade-location";
import { storageService } from "./storage";

const BODY_CLASS = "bt-dev-result-actions-visible";
const storageKey = (version: TradeSiteVersion) =>
  `experimental-result-actions-visible-poe${version}`;

let activeVersion: TradeSiteVersion = "1";
const { subscribe, set } = writable(false);

function apply(value: boolean) {
  set(value);
  document.body?.classList.toggle(BODY_CLASS, value);
}

export const experimentalSettings = {
  subscribe,
  useVersion(version: TradeSiteVersion) {
    activeVersion = version;
    apply(storageService.getLocalValue(storageKey(version)) === "true");
  },
  setResultActionsVisible(value: boolean) {
    storageService.setLocalValue(storageKey(activeVersion), String(value));
    apply(value);
  },
  teardown() {
    document.body?.classList.remove(BODY_CLASS);
  }
};
