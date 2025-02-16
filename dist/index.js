// src/index.tsx
var Event = /* @__PURE__ */ ((Event2) => {
  Event2["INIT"] = "antetype.init";
  Event2["CLOSE"] = "antetype.close";
  Event2["DRAW"] = "antetype.draw";
  Event2["CALC"] = "antetype.calc";
  Event2["RECALC_FINISHED"] = "antetype.recalc.finished";
  Event2["MODULES"] = "antetype.modules";
  return Event2;
})(Event || {});
var AntetypeCore = class {
  #injected;
  #moduleCore = null;
  #core = null;
  static inject = {
    minstrel: "boardmeister/minstrel",
    herald: "boardmeister/herald"
  };
  inject(injections) {
    this.#injected = injections;
  }
  async #getCore(modules, canvas) {
    if (!this.#core) {
      const module = this.#injected.minstrel.getResourceUrl(this, "core.js");
      this.#moduleCore = (await import(module)).default;
      this.#core = this.#moduleCore({ canvas, modules, injected: this.#injected });
    }
    return this.#core;
  }
  async register(event) {
    const { modules, canvas } = event.detail;
    modules.core = await this.#getCore(modules, canvas);
  }
  async init(event) {
    if (!this.#core) {
      throw new Error("Instance not loaded, trigger registration event first");
    }
    const { base, settings } = event.detail;
    for (const key in settings) {
      this.#core.setting.set(key, settings[key]);
    }
    const doc = this.#core.meta.document;
    doc.base = base;
    const promises = [];
    (this.#core.setting.get("fonts") ?? []).forEach((font) => {
      promises.push(this.#core.font.load(font));
    });
    await Promise.all(promises);
    doc.layout = await this.#core.view.recalculate(doc, doc.base);
    await this.#core.view.redraw(doc.layout);
    return doc;
  }
  async cloneDefinitions(event) {
    if (!this.#core) {
      throw new Error("Instance not loaded, trigger registration event first");
    }
    if (event.detail.element === null) {
      return;
    }
    event.detail.element = await this.#core.clone.definitions(event.detail.element);
  }
  static subscriptions = {
    ["antetype.modules" /* MODULES */]: "register",
    ["antetype.init" /* INIT */]: "init",
    ["antetype.calc" /* CALC */]: [
      {
        method: "cloneDefinitions",
        priority: -255
      }
    ]
  };
};
var EnAntetypeCore = AntetypeCore;
var src_default = EnAntetypeCore;
export {
  AntetypeCore,
  Event,
  src_default as default
};
