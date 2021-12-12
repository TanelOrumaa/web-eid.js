/*
 * QR Code generator library (TypeScript)
 *
 * Copyright (c) Project Nayuki. (MIT License)
 * https://www.nayuki.io/page/qr-code-generator-library
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of
 * this software and associated documentation files (the "Software"), to deal in
 * the Software without restriction, including without limitation the rights to
 * use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
 * the Software, and to permit persons to whom the Software is furnished to do so,
 * subject to the following conditions:
 * - The above copyright notice and this permission notice shall be included in
 *   all copies or substantial portions of the Software.
 * - The Software is provided "as is", without warranty of any kind, express or
 *   implied, including but not limited to the warranties of merchantability,
 *   fitness for a particular purpose and noninfringement. In no event shall the
 *   authors or copyright holders be liable for any claim, damages or other
 *   liability, whether in an action of contract, tort or otherwise, arising from,
 *   out of or in connection with the Software or the use or other dealings in the
 *   Software.
 */

import { QrCode } from "../models/qrcode/QrCode";

type bit = number;
type int = number;

// Appends the given number of low-order bits of the given value
// to the given buffer. Requires 0 <= len <= 31 and 0 <= val < 2^len.
export function appendBits(val: int, len: int, bb: Array<bit>): void {
  if (len < 0 || len > 31 || val >>> len != 0)
    throw "Value out of range";
  for (let i = len - 1; i >= 0; i--)  // Append bit by bit
    bb.push((val >>> i) & 1);
}


// Returns true iff the i'th bit of x is set to 1.
export function getBit(x: int, i: int): boolean {
  return ((x >>> i) & 1) != 0;
}


// Throws an exception if the given condition is false.
export function assert(cond: boolean): void {
  if (!cond)
    throw "Assertion error";
}

// Returns a string of SVG code for an image depicting the given QR Code, with the given number
// of border modules. The string always uses Unix newlines (\n), regardless of the platform.
export function toSvgString(qr: QrCode, border: number, lightColor: string, darkColor: string): string {
  if (border < 0)
    throw "Border must be non-negative";
  const parts: Array<string> = [];
  for (let y = 0; y < qr.size; y++) {
    for (let x = 0; x < qr.size; x++) {
      if (qr.getModule(x, y))
        parts.push(`M${x + border},${y + border}h1v1h-1z`);
    }
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">
<svg xmlns="http://www.w3.org/2000/svg" version="1.1" viewBox="0 0 ${qr.size + border * 2} ${qr.size + border * 2}" stroke="none">
	<rect width="100%" height="100%" fill="${lightColor}"/>
	<path d="${parts.join(" ")}" fill="${darkColor}"/>
</svg>`;
}
