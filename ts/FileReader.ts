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

    constructor(path: string, encoding: BufferEncoding) {
        let stats: Stats = statSync(path, { bigint: false, throwIfNoEntry: true });
        this.fileSize = stats.size;
        this.blockSize = stats.blksize;
        this.fileHandle = openSync(path, 'r');
        this.encoding = encoding;
        this.position = 0;
    }

    readData(): string {
        let buffer: Buffer = Buffer.alloc(this.blockSize, this.encoding);
        let amount: number = this.blockSize <= this.fileSize - this.position ? this.blockSize : this.fileSize - this.position;
        let bytesRead: number = readSync(this.fileHandle, buffer, 0, amount, this.position);
        this.position += bytesRead;
        return buffer.toString(this.encoding, 0, bytesRead);
    }

    dataAvailable(): boolean {
        return this.position < this.fileSize;
    }

    closeFile(): void {
        closeSync(this.fileHandle);
    }
}