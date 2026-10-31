/**
 * Inline bootstrap that must run before Next HMR writes to React debug channels.
 * Late REACT_DEBUG_CHUNK messages otherwise throw:
 *   TypeError: Cannot write to a CLOSED writable stream
 * which the Next overlay treats as an app error and blocks UI clicks.
 */
export const CLOSED_STREAM_GUARD_SCRIPT = `(function(){
  try {
    if (typeof WritableStreamDefaultWriter === "undefined") return;
    var proto = WritableStreamDefaultWriter.prototype;
    if (proto.__provixClosedStreamGuard) return;
    proto.__provixClosedStreamGuard = true;
    var originalWrite = proto.write;
    var originalClose = proto.close;
    function isClosedStreamError(error) {
      return Boolean(
        error &&
          error.name === "TypeError" &&
          /CLOSED writable stream/i.test(String(error.message || ""))
      );
    }
    proto.write = function (chunk) {
      try {
        return originalWrite.call(this, chunk);
      } catch (error) {
        if (isClosedStreamError(error)) return Promise.resolve(undefined);
        throw error;
      }
    };
    proto.close = function () {
      try {
        return originalClose.call(this);
      } catch (error) {
        if (isClosedStreamError(error)) return Promise.resolve(undefined);
        throw error;
      }
    };
  } catch (_) {}
})();`;

/** Renders the early browser patch as a blocking inline script. */
export default function DevClosedStreamGuard() {
  return (
    <script
      // Runs before hydration / HMR so Connect Repo and other actions stay clickable.
      dangerouslySetInnerHTML={{ __html: CLOSED_STREAM_GUARD_SCRIPT }}
    />
  );
}
