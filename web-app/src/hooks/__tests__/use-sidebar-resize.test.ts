import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useSidebarResize } from "../use-sidebar-resize";

describe("useSidebarResize", () => {
	beforeEach(() => {
		vi.stubGlobal("innerWidth", 1000);
		let cookie = "";
		Object.defineProperty(document, "cookie", {
			get: () => cookie,
			set: (val) => {
				cookie = val;
			},
			configurable: true,
		});
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
		vi.useRealTimers();
	});

	it("returns expected initial refs and callbacks", () => {
		const onResize = vi.fn();
		const { result } = renderHook(() =>
			useSidebarResize({ currentWidth: "20rem", onResize }),
		);

		expect(result.current.dragRef).toBeDefined();
		expect(result.current.isDragging.current).toBe(false);
		expect(typeof result.current.handleClick).toBe("function");
		expect(typeof result.current.handleMouseDown).toBe("function");
	});

	it("toggles panel on click if no drag interaction occurred", () => {
		const onResize = vi.fn();
		const onToggle = vi.fn();
		const { result } = renderHook(() =>
			useSidebarResize({ currentWidth: "20rem", onResize, onToggle }),
		);

		act(() => {
			result.current.handleClick();
		});

		expect(onToggle).toHaveBeenCalledTimes(1);
	});

	it("does not toggle panel on click if drag interaction occurred", () => {
		const onResize = vi.fn();
		const onToggle = vi.fn();
		const { result } = renderHook(() =>
			useSidebarResize({ currentWidth: "20rem", onResize, onToggle }),
		);

		act(() => {
			result.current.handleMouseDown(
				new MouseEvent("mousedown", { clientX: 100 }) as unknown as React.MouseEvent,
			);
		});

		act(() => {
			document.dispatchEvent(new MouseEvent("mousemove", { clientX: 150 }));
		});

		act(() => {
			document.dispatchEvent(new MouseEvent("mouseup"));
		});

		act(() => {
			result.current.handleClick();
		});

		expect(onToggle).not.toHaveBeenCalled();
	});

	it("sets dragging state and calls onResize on mousemove", () => {
		const onResize = vi.fn();
		const setIsDraggingRail = vi.fn();
		const { result } = renderHook(() =>
			useSidebarResize({
				direction: "right",
				currentWidth: "20rem",
				onResize,
				setIsDraggingRail,
				isNested: false,
			}),
		);

		act(() => {
			result.current.handleMouseDown(
				new MouseEvent("mousedown", { clientX: 320 }) as unknown as React.MouseEvent,
			);
		});

		expect(result.current.isDragging.current).toBe(false);

		act(() => {
			document.dispatchEvent(new MouseEvent("mousemove", { clientX: 322 }));
		});
		expect(result.current.isDragging.current).toBe(false);

		act(() => {
			document.dispatchEvent(new MouseEvent("mousemove", { clientX: 330 }));
		});
		expect(result.current.isDragging.current).toBe(true);
		expect(setIsDraggingRail).toHaveBeenCalledWith(true);
		expect(onResize).toHaveBeenCalledWith("20.6rem");

		act(() => {
			document.dispatchEvent(new MouseEvent("mouseup"));
		});
		expect(result.current.isDragging.current).toBe(false);
		expect(setIsDraggingRail).toHaveBeenCalledWith(false);
	});

	it("handles left direction correctly", () => {
		const onResize = vi.fn();
		const { result } = renderHook(() =>
			useSidebarResize({
				direction: "left",
				currentWidth: "20rem",
				onResize,
			}),
		);

		act(() => {
			result.current.handleMouseDown(
				new MouseEvent("mousedown", { clientX: 680 }) as unknown as React.MouseEvent,
			);
		});

		act(() => {
			document.dispatchEvent(new MouseEvent("mousemove", { clientX: 670 }));
		});

		expect(onResize).toHaveBeenCalledWith("20.6rem");
	});

	it("calculates width correctly for nested sidebars", () => {
		const onResize = vi.fn();
		const { result } = renderHook(() =>
			useSidebarResize({
				direction: "right",
				currentWidth: "20rem",
				onResize,
				isNested: true,
			}),
		);

		const mockButton = document.createElement("button");
		mockButton.getBoundingClientRect = () =>
			({
				left: 320,
				right: 330,
				top: 0,
				bottom: 100,
				width: 10,
				height: 100,
			}) as DOMRect;

		Object.defineProperty(result.current.dragRef, "current", {
			value: mockButton,
			writable: true,
		});

		act(() => {
			result.current.handleMouseDown(
				new MouseEvent("mousedown", { clientX: 320 }) as unknown as React.MouseEvent,
			);
		});

		act(() => {
			document.dispatchEvent(new MouseEvent("mousemove", { clientX: 330 }));
		});

		expect(onResize).toHaveBeenCalledWith("20.6rem");
	});

	it("clamps to maxResizeWidth when dragged too far", () => {
		const onResize = vi.fn();
		const { result } = renderHook(() =>
			useSidebarResize({
				direction: "right",
				currentWidth: "20rem",
				onResize,
				maxResizeWidth: "24rem",
			}),
		);

		act(() => {
			result.current.handleMouseDown(
				new MouseEvent("mousedown", { clientX: 320 }) as unknown as React.MouseEvent,
			);
		});

		act(() => {
			document.dispatchEvent(new MouseEvent("mousemove", { clientX: 500 }));
		});

		expect(onResize).toHaveBeenCalledWith("24.0rem");
	});

	it("persists width to cookie if widthCookieName is provided", () => {
		const onResize = vi.fn();
		const { result } = renderHook(() =>
			useSidebarResize({
				direction: "right",
				currentWidth: "20rem",
				onResize,
				widthCookieName: "sidebarWidth",
			}),
		);

		act(() => {
			result.current.handleMouseDown(
				new MouseEvent("mousedown", { clientX: 320 }) as unknown as React.MouseEvent,
			);
		});

		act(() => {
			document.dispatchEvent(new MouseEvent("mousemove", { clientX: 330 }));
		});

		expect(document.cookie).toContain("sidebarWidth=20.6rem");
	});

	it("collapses when dragged beyond autoCollapseThreshold", () => {
		const onResize = vi.fn();
		const onToggle = vi.fn();
		const { result } = renderHook(() =>
			useSidebarResize({
				direction: "right",
				currentWidth: "20rem",
				onResize,
				onToggle,
				minResizeWidth: "14rem",
				enableAutoCollapse: true,
				autoCollapseThreshold: 1.5,
			}),
		);

		act(() => {
			result.current.handleMouseDown(
				new MouseEvent("mousedown", { clientX: 320 }) as unknown as React.MouseEvent,
			);
		});

		act(() => {
			document.dispatchEvent(new MouseEvent("mousemove", { clientX: 113 }));
		});
		expect(onToggle).not.toHaveBeenCalled();

		act(() => {
			document.dispatchEvent(new MouseEvent("mousemove", { clientX: 110 }));
		});
		expect(onToggle).toHaveBeenCalledTimes(1);
	});

	it("expands when collapsed and dragged past expandThreshold", () => {
		const onResize = vi.fn();
		const onToggle = vi.fn();
		const { result } = renderHook(() =>
			useSidebarResize({
				direction: "right",
				currentWidth: "20rem",
				onResize,
				onToggle,
				isCollapsed: true,
				minResizeWidth: "14rem",
				expandThreshold: 0.2,
			}),
		);

		act(() => {
			result.current.handleMouseDown(
				new MouseEvent("mousedown", { clientX: 0 }) as unknown as React.MouseEvent,
			);
		});

		act(() => {
			document.dispatchEvent(new MouseEvent("mousemove", { clientX: 40 }));
		});
		expect(onToggle).not.toHaveBeenCalled();

		act(() => {
			document.dispatchEvent(new MouseEvent("mousemove", { clientX: 50 }));
		});
		expect(onToggle).toHaveBeenCalledTimes(1);
		expect(onResize).toHaveBeenCalledWith("14.0rem");
	});

	it("cleans up event listeners on unmount", () => {
		const removeEventListenerSpy = vi.spyOn(document, "removeEventListener");

		const { unmount } = renderHook(() =>
			useSidebarResize({ currentWidth: "20rem", onResize: vi.fn() }),
		);

		unmount();

		const mouseMoveRemoved = removeEventListenerSpy.mock.calls.some(
			(call) => call[0] === "mousemove",
		);
		const mouseUpRemoved = removeEventListenerSpy.mock.calls.some(
			(call) => call[0] === "mouseup",
		);

		expect(mouseMoveRemoved).toBe(true);
		expect(mouseUpRemoved).toBe(true);
	});

	it.skip("bug: fails to update startX and startWidth after expanding a collapsed nested sidebar, causing erratic width calculation on continued drag", () => {
		// After expanding from collapsed state, the hook calculates width using the original startX and startWidth (which is 0). On subsequent mouse moves (after re-render with isCollapsed=false), the width calculation for nested sidebars incorrectly bases the size off 0 width and the original start point instead of the new size and toggle point, causing the width to jump erratically.
	});
});
