/*******************************************************************************
 * Copyright (c) 2023 - 2025 Maxprograms.
 *
 * This program and the accompanying materials
 * are made available under the terms of the Eclipse   License 1.0
 * which accompanies this distribution, and is available at
 * https://www.eclipse.org/org/documents/epl-v10.html
 *
 * Contributors:
 *     Maxprograms - initial API and implementation
 *******************************************************************************/

import { Stats, closeSync, openSync, readSync, statSync } from "fs";

export class FileReader {

    fileHandle: number;
    encoding: BufferEncoding;
    blockSize: number;
    fileSize: number;
    position: number;
    firstRead: boolean;

    constructor(path: string, encoding?: BufferEncoding) {
        let stats: Stats = statSync(path, { bigint: false, throwIfNoEntry: true });
        this.fileSize = stats.size;
        this.blockSize = stats.blksize;
        this.fileHandle = openSync(path, 'r');
        if (encoding) {
            this.encoding = encoding;
        } else {
            this.encoding = FileReader.detectEncoding(path);
        }
        this.position = 0;
        this.firstRead = true;
    }

    static detectEncoding(path: string): BufferEncoding {
        const fd = openSync(path, 'r');
        const buffer: Buffer = Buffer.alloc(3);
        const bytesRead: number = readSync(fd, buffer, 0, 3, 0);
        closeSync(fd);

        if (bytesRead === 0) {
            return 'utf8';
        }

        const slice: Buffer = buffer.subarray(0, bytesRead);
        const UTF8: Buffer = Buffer.from([0xEF, 0xBB, 0xBF]);
        const UTF16LE: Buffer = Buffer.from([0xFF, 0xFE]);
        const UTF16BE: Buffer = Buffer.from([0xFE, 0xFF]);

        if (slice.length >= UTF8.length && slice.compare(UTF8, 0, UTF8.length, 0, UTF8.length) === 0) {
            return 'utf8';
        }
        if (slice.length >= UTF16LE.length && slice.compare(UTF16LE, 0, UTF16LE.length, 0, UTF16LE.length) === 0) {
            return 'utf16le';
        }
        if (slice.length >= UTF16BE.length && slice.compare(UTF16BE, 0, UTF16BE.length, 0, UTF16BE.length) === 0) {
            return 'utf16le';
        }
        return 'utf8';
    }

    getEncoding(): BufferEncoding {
        return this.encoding;
    }

    setEncoding(encoding: BufferEncoding): void {
        this.encoding = encoding;
    }

    read(): string {
        let buffer: Buffer = Buffer.alloc(this.blockSize, this.encoding);
        let amount: number = this.blockSize <= this.fileSize - this.position ? this.blockSize : this.fileSize - this.position;
        let bytesRead: number = readSync(this.fileHandle, buffer, 0, amount, this.position);
        this.position += bytesRead;
        return this.firstRead ? this.skipBOM(buffer, bytesRead) : buffer.toString(this.encoding, 0, bytesRead);
    }

    skipBOM(buffer: Buffer, bytesRead: number): string {
        this.firstRead = false;
        const result: string = buffer.toString(this.encoding, 0, bytesRead);
        if (result.length > 0 && result.charCodeAt(0) === 0xFEFF) {
            return result.substring(1);
        }
        return result;
    }

    dataAvailable(): boolean {
        return this.position < this.fileSize;
    }

    getFileSize(): number {
        return this.fileSize;
    }

    closeFile(): void {
        closeSync(this.fileHandle);
    }
}