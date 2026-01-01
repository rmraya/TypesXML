/*******************************************************************************
 * Copyright (c) 2023-2026 Maxprograms.
 *
 * This program and the accompanying materials
 * are made available under the terms of the Eclipse   License 1.0
 * which accompanies this distribution, and is available at
 * https://www.eclipse.org/org/documents/epl-v10.html
 *
 * Contributors:
 *     Maxprograms - initial API and implementation
 *******************************************************************************/

import { NeedMoreDataError } from "./NeedMoreDataError";

export class StreamReader {

    encoding: BufferEncoding;
    chunks: Array<string>;
    finished: boolean;

    constructor(encoding: BufferEncoding) {
        this.encoding = encoding;
        this.chunks = [];
        this.finished = false;
    }

    enqueue(chunk: string): void {
        this.chunks.push(chunk);
    }

    markFinished(): void {
        this.finished = true;
    }

    read(): string {
        if (this.chunks.length > 0) {
            return this.chunks.shift() as string;
        }
        if (this.finished) {
            return '';
        }
        throw new NeedMoreDataError();
    }

    dataAvailable(): boolean {
        return this.chunks.length > 0;
    }

    isFinished(): boolean {
        return this.finished && this.chunks.length === 0;
    }

    closeFile(): void {
        this.chunks.length = 0;
        this.finished = true;
    }
}
