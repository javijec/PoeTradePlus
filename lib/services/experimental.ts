import { writable } from "svelte/store";
import type { TradeSiteVersion } from "../types/trade-location";
import { storageService } from "./storage";

const BODY_CLASS = "bt-dev-result-actions-visible";
const POE2_COPY_BODY_CLASS = "bt-dev-poe2-copy-visible";
const POE2_BODY_CLASS = "bt-trade-poe2";
const POE2_COE_BODY_CLASS = "bt-dev-poe2-coe-visible";
const storageKey = (version: TradeSiteVersion) =>
  `experimental-result-actions-visible-poe${version}`;
const POE2_COPY_STORAGE_KEY = "experimental-poe2-copy-visible";
const POE2_COE_STORAGE_KEY = "experimental-poe2-coe-visible";

let activeVersion: TradeSiteVersion = "1";
const { subscribe, set } = writable(false);
const {
  subscribe: subscribePoe2Copy,
  set: setPoe2Copy
} = writable(false);
let isPoe2CopyVisible = false;
const {
  subscribe: subscribePoe2Coe,
  set: setPoe2Coe
} = writable(false);
let isPoe2CoeVisible = false;

function apply(value: boolean) {
  set(value);
  document.body?.classList.toggle(BODY_CLASS, value);
}

function applyPoe2CopyVisibility(value: boolean) {
  isPoe2CopyVisible = activeVersion === "2" && value;
  setPoe2Copy(isPoe2CopyVisible);
  document.body?.classList.toggle(POE2_COPY_BODY_CLASS, isPoe2CopyVisible);

  if (activeVersion === "2") {
    document.querySelectorAll<HTMLButtonElement>(".row > .left > button.copy").forEach((button) => {
      experimentalSettings.applyPoe2CopyButton(button);
    });
  }
}

function applyPoe2CoeVisibility(value: boolean) {
  isPoe2CoeVisible = activeVersion === "2" && value;
  setPoe2Coe(isPoe2CoeVisible);
  document.body?.classList.toggle(POE2_COE_BODY_CLASS, isPoe2CoeVisible);
  document.dispatchEvent(new CustomEvent("poe-trade-plus:experimental-change"));
}

export const experimentalSettings = {
  subscribe,
  subscribePoe2Copy,
  subscribePoe2Coe,
  useVersion(version: TradeSiteVersion) {
    activeVersion = version;
    document.body?.classList.toggle(POE2_BODY_CLASS, version === "2");
    apply(storageService.getLocalValue(storageKey(version)) === "true");
    applyPoe2CopyVisibility(
      storageService.getLocalValue(POE2_COPY_STORAGE_KEY) === "true"
    );
    applyPoe2CoeVisibility(
      storageService.getLocalValue(POE2_COE_STORAGE_KEY) === "true"
    );
  },
  setResultActionsVisible(value: boolean) {
    storageService.setLocalValue(storageKey(activeVersion), String(value));
    apply(value);
  },
  setPoe2CopyVisible(value: boolean) {
    storageService.setLocalValue(POE2_COPY_STORAGE_KEY, String(value));
    applyPoe2CopyVisibility(value);
  },
  setPoe2CoeVisible(value: boolean) {
    storageService.setLocalValue(POE2_COE_STORAGE_KEY, String(value));
    applyPoe2CoeVisibility(value);
  },
  isPoe2CoeVisible() {
    return isPoe2CoeVisible;
  },
  isPoe2CopyVisible() {
    return isPoe2CopyVisible;
  },
  applyPoe2CopyButton(button: HTMLButtonElement) {
    if (activeVersion !== "2") {
      button.style.removeProperty("display");
      button.style.removeProperty("visibility");
      return;
    }

    if (isPoe2CopyVisible) {
      button.hidden = false;
      button.removeAttribute("hidden");
      button.classList.remove("hidden");
      button.style.removeProperty("display");
      button.style.removeProperty("visibility");
      return;
    }

    button.hidden = true;
    button.classList.add("hidden");
    button.style.setProperty("display", "none");
  },
  teardown() {
    document.body?.classList.remove(BODY_CLASS);
    document.body?.classList.remove(POE2_COPY_BODY_CLASS);
    document.body?.classList.remove(POE2_BODY_CLASS);
    document.body?.classList.remove(POE2_COE_BODY_CLASS);
  }
};

export const poe2CopyButtonSetting = {
  subscribe: subscribePoe2Copy
};

export const poe2CoeButtonSetting = {
  subscribe: subscribePoe2Coe
};
