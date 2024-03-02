/*******************************************************************************
 * Copyright (c) 2023 - 2024 Maxprograms.
 *
 * This program and the accompanying materials
 * are made available under the terms of the Eclipse   License 1.0
 * which accompanies this distribution, and is available at
 * https://www.eclipse.org/org/documents/epl-v10.html
 *
 * Contributors:
 *     Maxprograms - initial API and implementation
 *******************************************************************************/
import { XMLReader } from "./XMLReader";

export class StringReader implements XMLReader {

    CHUNK_SIZE: number = 4096;

    data: string;
    position: number;

    constructor(data: string) {
        this.data = data;
        this.position = 0;
    }

    dataAvailable(): boolean {
        return this.position < this.data.length;
    }

    read(): string {
        let amount: number = this.CHUNK_SIZE;
        if (this.position + this.CHUNK_SIZE > this.data.length) {
            amount = this.data.length - this.position;
        }
        let result: string = this.data.substring(this.position, amount);
        this.position += amount;
        return result;
    }

}