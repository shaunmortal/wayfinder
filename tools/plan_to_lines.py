"""Turn a phone photo of a fire evacuation plan into map-ready images.

Usage:
  python tools/plan_to_lines.py plan.jpg out_dir [--corners x1,y1,x2,y2,x3,y3,x4,y4] [--width 1600]

Corners are the board's top-left, top-right, bottom-right, bottom-left in photo pixels.
Without --corners the script looks for the largest bright four-sided shape (the board).

Writes:
  rect.png   the board, straightened
  grid.png   the same with a 50 px grid and labels, for tracing coordinates
  lines.png  dark lines only (red route arrows and labels removed), transparent background
"""
import argparse, os
import cv2
import numpy as np


def find_board(img):
    """Largest four-sided outline that does not touch the photo edge (the board's frame)."""
    h, w = img.shape[:2]
    gray = cv2.GaussianBlur(cv2.cvtColor(img, cv2.COLOR_BGR2GRAY), (5, 5), 0)
    edges = cv2.dilate(cv2.Canny(gray, 40, 120), np.ones((5, 5), np.uint8))
    cs, _ = cv2.findContours(edges, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
    best, best_area = None, 0.05 * w * h
    for c in cs:
        hull = cv2.convexHull(c)
        ap = cv2.approxPolyDP(hull, 0.02 * cv2.arcLength(hull, True), True).reshape(-1, 2)
        if len(ap) != 4: continue
        x, y, bw, bh = cv2.boundingRect(ap)
        if x <= 3 or y <= 3 or x + bw >= w - 3 or y + bh >= h - 3: continue
        area = cv2.contourArea(ap)
        if area > best_area: best, best_area = ap, area
    if best is None:
        raise SystemExit('Could not find the board. Pass --corners x1,y1,x2,y2,x3,y3,x4,y4 (TL,TR,BR,BL).')
    s_ = best.sum(1); d = np.diff(best, axis=1).ravel()
    return np.float32([best[np.argmin(s_)], best[np.argmin(d)], best[np.argmax(s_)], best[np.argmax(d)]])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('photo'); ap.add_argument('out')
    ap.add_argument('--corners'); ap.add_argument('--width', type=int, default=1600)
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    img = cv2.imread(a.photo)
    src = np.float32([float(v) for v in a.corners.split(',')]).reshape(4, 2) if a.corners else find_board(img)
    top = np.linalg.norm(src[1] - src[0]); left = np.linalg.norm(src[3] - src[0])
    W = a.width; H = int(W * left / top)
    M = cv2.getPerspectiveTransform(src, np.float32([[0, 0], [W, 0], [W, H], [0, H]]))
    rect = cv2.warpPerspective(img, M, (W, H), flags=cv2.INTER_CUBIC)
    cv2.imwrite(os.path.join(a.out, 'rect.png'), rect)

    grid = rect.copy()
    for x in range(0, W, 50):
        cv2.line(grid, (x, 0), (x, H), (255, 0, 255) if x % 200 == 0 else (200, 150, 255), 1)
        if x % 100 == 0: cv2.putText(grid, str(x), (x + 2, 14), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (120, 0, 120), 1)
    for y in range(0, H, 50):
        cv2.line(grid, (0, y), (W, y), (255, 0, 255) if y % 200 == 0 else (200, 150, 255), 1)
        if y % 100 == 0: cv2.putText(grid, str(y), (2, y - 2), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (120, 0, 120), 1)
    cv2.imwrite(os.path.join(a.out, 'grid.png'), grid)

    b, g, r = [rect[:, :, i].astype(int) for i in range(3)]
    gray = cv2.cvtColor(rect, cv2.COLOR_BGR2GRAY)
    diff = cv2.GaussianBlur(gray, (0, 0), 9).astype(int) - gray.astype(int)   # darker than surroundings
    red = cv2.dilate(((r - g > 22) & (r - b > 18) & (r > 70)).astype(np.uint8), np.ones((5, 5), np.uint8)) > 0
    line = np.clip((diff - 14) * 9, 0, 255).astype(np.uint8); line[red] = 0
    n, lab, st, _ = cv2.connectedComponentsWithStats((line > 60).astype(np.uint8), 8)
    keep = np.zeros(n, bool); keep[1:] = st[1:, cv2.CC_STAT_AREA] >= 22
    alpha = cv2.dilate(np.where(keep[lab], line, 0).astype(np.uint8), np.ones((2, 2), np.uint8))
    rgba = np.zeros((H, W, 4), np.uint8); rgba[:, :, :3] = (40, 30, 20); rgba[:, :, 3] = alpha
    cv2.imwrite(os.path.join(a.out, 'lines.png'), rgba, [cv2.IMWRITE_PNG_COMPRESSION, 9])
    print('wrote rect.png, grid.png, lines.png  size', W, 'x', H)
    print('Crop lines.png to the building, then remove leftover "You are here" marks before using it.')


if __name__ == '__main__':
    main()
