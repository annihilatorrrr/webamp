import {
  useState,
  useEffect,
  useCallback,
  useLayoutEffect,
  useRef,
} from "react";
import { useDispatch, useSelector } from "react-redux";
import * as Utils from "./utils";
import { Action, Thunk, AppState } from "./types";

interface Size {
  width: number;
  height: number;
}

export function useUnmountedRef(): { current: boolean } {
  const unmountedRef = useRef(false);
  useEffect(() => {
    return () => {
      unmountedRef.current = true;
    };
  }, []);
  return unmountedRef;
}

export function usePromiseValueOrNull<T>(propValue: Promise<T>): T | null {
  const [value, setValue] = useState<T | null>(null);
  useEffect(() => {
    let disposed = false;
    propValue.then((resolvedValue) => {
      if (disposed) {
        return;
      }
      setValue(resolvedValue);
    });

    return () => {
      disposed = true;
    };
  }, [propValue]);

  return value;
}

export function useScreenSize() {
  const [size] = useState<Size>(Utils.getScreenSize());
  // TODO: We could subscribe to screen size changes.
  return size;
}

export function useWindowSize() {
  const [size, setSize] = useState<Size>(Utils.getWindowSize());
  const handler = useCallback(() => {
    Utils.throttle(() => {
      setSize(Utils.getWindowSize());
    }, 100) as () => void;
  }, []);
  useEffect(() => {
    window.addEventListener("resize", handler);
    return () => {
      window.removeEventListener("resize", handler);
    };
  }, [handler]);
  return size;
}

const cursorPositionRef = { current: { pageX: 0, pageY: 0 } };
let listenerRefCount = 0;

// Global mousemove listener - managed with reference counting
const globalMouseMoveHandler = ({ pageX, pageY }: MouseEvent) => {
  cursorPositionRef.current = { pageX, pageY };
};

// Add a reference to the global mouse listener
function addGlobalMouseListener() {
  if (listenerRefCount === 0) {
    window.document.addEventListener("mousemove", globalMouseMoveHandler);
  }
  listenerRefCount++;
}

// Remove a reference to the global mouse listener
function removeGlobalMouseListener() {
  listenerRefCount--;
  if (listenerRefCount === 0) {
    window.document.removeEventListener("mousemove", globalMouseMoveHandler);
  }
}

// We use a single global event listener with reference counting because there is no way to get the
// mouse position aside from an event. The listener is only active when at least one component needs it.
function useCursorPositionRef() {
  useEffect(() => {
    addGlobalMouseListener();
    return () => {
      removeGlobalMouseListener();
    };
  }, []);

  return cursorPositionRef;
}

// CSS hover state is not respected if the cursor is already over the node when
// it is added to the DOM. This hook allows your component to know its hover
// state on mount without waiting for the mouse to move.
// https://stackoverflow.com/a/13259049/1263117
export function useIsHovered() {
  const cursorRef = useCursorPositionRef();
  const [hover, setHover] = useState(false);
  const [node, setNode] = useState<HTMLElement | null>(null);

  useLayoutEffect(() => {
    if (node == null) {
      setHover(false);
      return;
    }
    const domRect = node.getBoundingClientRect();
    const { pageX, pageY } = cursorRef.current;
    setHover(
      pageX >= domRect.left &&
        pageX <= domRect.right &&
        pageY >= domRect.top &&
        pageY <= domRect.bottom
    );

    const enter = () => setHover(true);
    const leave = () => setHover(false);
    node.addEventListener("mouseenter", enter);
    node.addEventListener("mouseleave", leave);

    return () => {
      node.removeEventListener("mouseenter", enter);
      node.removeEventListener("mouseleave", leave);
    };
  }, [node, cursorRef]);

  return { ref: setNode, hover };
}

export function useOnClickAway(
  ref: Element | null,
  callback: null | (() => void)
) {
  useEffect(() => {
    if (ref == null || callback == null) {
      return;
    }

    const handleClickOut = (ee: MouseEvent) => {
      const clickOutTarget = ee.target;
      if (!(clickOutTarget instanceof Element)) {
        // TypeScript doesn't realize this will always be true
        return;
      }
      if (ref.contains(clickOutTarget)) {
        return;
      }
      // If the click is _not_ inside the menu.
      callback();
      window.document.removeEventListener("click", handleClickOut, {
        capture: true,
      });
    };

    window.document.addEventListener("click", handleClickOut, {
      capture: true,
    });

    return () => {
      window.document.removeEventListener("click", handleClickOut, {
        capture: true,
      });
    };
  }, [ref, callback]);
}

// TODO: Return useSelector directly and apply the type without wrapping
export function useTypedSelector<T>(selector: (state: AppState) => T): T {
  return useSelector(selector);
}

export function useActionCreator<T extends (...args: any[]) => Action | Thunk>(
  actionCreator: T
): (...funcArgs: Parameters<T>) => void {
  const dispatch = useTypedDispatch();
  return useCallback(
    (...args) => dispatch(actionCreator(...args)),
    [dispatch, actionCreator]
  );
}

export function useTypedDispatch(): (action: Action | Thunk) => void {
  // useDispatch does not know about thunks. In theory this should be solvable, but I haven't bothered to figure it out:
  // https://redux.js.org/usage/usage-with-typescript#type-checking-redux-thunks
  // @ts-ignore
  return useDispatch();
}
