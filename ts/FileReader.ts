/*******************************************************************************
 * Copyright (c) 2023 Maxprograms.
 *
 * This program and the accompanying materials
 * are made available under the terms of the Eclipse   License 1.0
 * which accompanies this distribution, and is available at
 * https://www.eclipse.org/org/documents/epl-v10.html
 *
 * Contributors:
 *     Maxprograms - initial API and implementation
 *******************************************************************************/

import { openSync, readSync, closeSync, statSync, Stats } from "fs";

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
        let buffer = Buffer.alloc(3);
        let bytesRead: number = readSync(fd, buffer, 0, 3, 0);
        closeSync(fd);

        if (bytesRead < 3) {
            throw new Error('Error reading BOM: not enough bytes');
        }
        const UTF8: Buffer = Buffer.from([-17, -69, -65]);
        const UTF16: Buffer = Buffer.from([-2, -1]);

        if (buffer.toString().startsWith(UTF8.toString())) {
            return 'utf8';
        }
        if (buffer.toString().startsWith(UTF16.toString())) {
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
        const utf8Bom: string = Buffer.from([-17, -69, -65]).toString();
        const utf16Bom: string = Buffer.from([-2, -1]).toString();
        let result: string = buffer.toString(this.encoding, 0, bytesRead);
        if (result.startsWith(utf8Bom)) {
            return result.substring(utf8Bom.length);
        }
        if (result.startsWith(utf16Bom)) {
            return result.substring(utf16Bom.length);
        }
        return buffer.toString(this.encoding, 0, bytesRead);
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