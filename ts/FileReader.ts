/*******************************************************************************
 * Copyright (c) 2023 - 2025 Maxprograms.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published
 * by the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
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
        let buffer: Buffer = Buffer.alloc(3);
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