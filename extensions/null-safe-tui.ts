import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Box, Container } from "@mariozechner/pi-tui";

type AnyComponent = {
  render: (width: number) => string[];
  invalidate?: () => void;
} | null | undefined;

const PATCH_FLAG = Symbol.for("pi-tui-null-safe-patch");

function patchComponentClass(klass: any) {
  if (klass?.prototype?.[PATCH_FLAG]) {
    return;
  }

  const proto = klass.prototype;
  if (!proto) {
    return;
  }

  const originalAddChild = proto.addChild;
  const originalRemoveChild = proto.removeChild;
  const originalInvalidate = proto.invalidate;
  const originalRender = proto.render;

  proto.addChild = function (component: AnyComponent) {
    if (component == null) {
      return;
    }
    return originalAddChild.call(this, component);
  };

  proto.removeChild = function (component: AnyComponent) {
    if (component == null) {
      return;
    }
    return originalRemoveChild.call(this, component);
  };

  proto.invalidate = function () {
    if (Array.isArray(this.children)) {
      this.children = this.children.filter((child: AnyComponent) => child != null);
    }
    return originalInvalidate.call(this);
  };

  proto.render = function (width: number) {
    if (Array.isArray(this.children)) {
      this.children = this.children.filter((child: AnyComponent) => child != null);
    }
    return originalRender.call(this, width) ?? [];
  };

  proto[PATCH_FLAG] = true;
}

export default function nullSafeTuiExtension(_pi: ExtensionAPI) {
  patchComponentClass(Container);
  patchComponentClass(Box);
}
