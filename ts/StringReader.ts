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

export class StringReader {

    data: string;
    offset: number = 0;
    readonly chunkSize: number;

    constructor(data: string, chunkSize: number = 8192) {
        this.data = data;
        this.chunkSize = Math.max(chunkSize, 1);
    }

    read(): string {
        if (!this.dataAvailable()) {
            return '';
        }
        const nextOffset: number = Math.min(this.offset + this.chunkSize, this.data.length);
        const chunk: string = this.data.substring(this.offset, nextOffset);
        this.offset = nextOffset;
        return chunk;
    }

    dataAvailable(): boolean {
        return this.offset < this.data.length;
    }

    closeFile(): void {
        // no resources to release
    }
}
