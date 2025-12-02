/*******************************************************************************
 * Copyright (c) 2025 Maxprograms.
 *
 * This program and the accompanying materials
 * are made available under the terms of the Eclipse   License 1.0
 * which accompanies this distribution, and is available at
 * https://www.eclipse.org/org/documents/epl-v10.html
 *
 * Contributors:
 *     Maxprograms - initial API and implementation
 *******************************************************************************/

import { createWriteStream } from "node:fs";
import { Readable, Writable } from "node:stream";
import { ContentHandler } from "../ContentHandler";
import { DOMBuilder } from "../DOMBuilder";
import { FileReader } from "../FileReader";
import { NeedMoreDataError } from "../NeedMoreDataError";
import { ParseSourceOptions, SAXParser, StreamParseOptions } from "../SAXParser";
import { XMLDocument } from "../XMLDocument";
import { JsonEventCollector } from "./JsonEventCollector";
import { JsonEventStreamWriter } from "./JsonEventStreamWriter";
import { JsonNodeEvent, JsonNodeReader } from "./JsonNodeReader";
import { JsonTokenizer } from "./JsonTokenizer";
import { JsonToXmlHandler } from "./JsonToXmlHandler";
import { XmlEventStreamWriter } from "./XmlEventStreamWriter";

export function xmlStringToJsonEvents(data: string, options?: ParseSourceOptions): Array<JsonNodeEvent> {
    const parser: SAXParser = new SAXParser();
    const collector: JsonEventCollector = new JsonEventCollector();
    parser.setContentHandler(collector);
    parser.parseString(data, options);
    const events: Array<JsonNodeEvent> = collector.getEvents();
    return events;
}

export function xmlFileToJsonEvents(path: string, encoding?: BufferEncoding): Array<JsonNodeEvent> {
    const parser: SAXParser = new SAXParser();
    const collector: JsonEventCollector = new JsonEventCollector();
    parser.setContentHandler(collector);
    parser.parseFile(path, encoding);
    const events: Array<JsonNodeEvent> = collector.getEvents();
    return events;
}

export async function xmlStreamToJsonEvents(stream: Readable, options?: StreamParseOptions): Promise<Array<JsonNodeEvent>> {
    const parser: SAXParser = new SAXParser();
    const collector: JsonEventCollector = new JsonEventCollector();
    parser.setContentHandler(collector);
    await parser.parseStream(stream, options);
    const events: Array<JsonNodeEvent> = collector.getEvents();
    return events;
}

export function xmlStringToJsonStream(data: string, output: Writable, options?: ParseSourceOptions): Promise<void> {
    const parser: SAXParser = new SAXParser();
    const writer: JsonEventStreamWriter = new JsonEventStreamWriter(output);
    parser.setContentHandler(writer);
    parser.parseString(data, options);
    output.end();
    return waitForWritable(output);
}

export function xmlFileToJsonStream(path: string, output: Writable, encoding?: BufferEncoding): Promise<void> {
    const parser: SAXParser = new SAXParser();
    const writer: JsonEventStreamWriter = new JsonEventStreamWriter(output);
    parser.setContentHandler(writer);
    parser.parseFile(path, encoding);
    output.end();
    return waitForWritable(output);
}

export async function xmlStreamToJsonStream(stream: Readable, output: Writable, options?: StreamParseOptions): Promise<void> {
    const parser: SAXParser = new SAXParser();
    const writer: JsonEventStreamWriter = new JsonEventStreamWriter(output);
    parser.setContentHandler(writer);
    await parser.parseStream(stream, options);
    output.end();
    await waitForWritable(output);
}

export function xmlDocumentToJsonEvents(document: XMLDocument): Array<JsonNodeEvent> {
    const serialized: string = document.toString();
    const events: Array<JsonNodeEvent> = xmlStringToJsonEvents(serialized);
    return events;
}

export function jsonEventsToXmlDocument(events: Array<JsonNodeEvent>): XMLDocument {
    const domBuilder: DOMBuilder = new DOMBuilder();
    domBuilder.initialize();
    const handler: JsonToXmlHandler = new JsonToXmlHandler(domBuilder);
    for (let index: number = 0; index < events.length; index++) {
        const event: JsonNodeEvent = events[index];
        handler.handleEvent(event);
    }
    const document: XMLDocument | undefined = domBuilder.getDocument();
    if (!document) {
        throw new Error("JSON events did not produce an XML document");
    }
    return document;
}

export function jsonStringToXmlDocument(json: string): XMLDocument {
    const domBuilder: DOMBuilder = new DOMBuilder();
    jsonStringToContentHandler(json, domBuilder);
    const document: XMLDocument | undefined = domBuilder.getDocument();
    if (!document) {
        throw new Error("JSON string did not produce an XML document");
    }
    return document;
}

export function jsonFileToXmlDocument(path: string, encoding?: BufferEncoding): XMLDocument {
    const domBuilder: DOMBuilder = new DOMBuilder();
    jsonFileToContentHandler(path, domBuilder, encoding);
    const document: XMLDocument | undefined = domBuilder.getDocument();
    if (!document) {
        throw new Error("JSON file did not produce an XML document");
    }
    return document;
}

export async function jsonStreamToXmlDocument(stream: Readable, encoding: BufferEncoding = "utf8"): Promise<XMLDocument> {
    const domBuilder: DOMBuilder = new DOMBuilder();
    await jsonStreamToContentHandler(stream, domBuilder, encoding);
    const document: XMLDocument | undefined = domBuilder.getDocument();
    if (!document) {
        throw new Error("JSON stream did not produce an XML document");
    }
    return document;
}

export function jsonStringToXmlStream(json: string, output: Writable, encoding: BufferEncoding = "utf8", autoClose: boolean = true): Promise<void> {
    const handler: XmlEventStreamWriter = new XmlEventStreamWriter(output, encoding, autoClose);
    jsonStringToContentHandler(json, handler);
    if (autoClose) {
        return waitForWritable(output);
    }
    return Promise.resolve();
}

export function jsonFileToXmlStream(path: string, output: Writable, jsonEncoding?: BufferEncoding, xmlEncoding: BufferEncoding = "utf8", autoClose: boolean = true): Promise<void> {
    const handler: XmlEventStreamWriter = new XmlEventStreamWriter(output, xmlEncoding, autoClose);
    jsonFileToContentHandler(path, handler, jsonEncoding);
    if (autoClose) {
        return waitForWritable(output);
    }
    return Promise.resolve();
}

export async function jsonStreamToXmlStream(stream: Readable, output: Writable, jsonEncoding: BufferEncoding = "utf8", xmlEncoding: BufferEncoding = "utf8", autoClose: boolean = true): Promise<void> {
    const handler: XmlEventStreamWriter = new XmlEventStreamWriter(output, xmlEncoding, autoClose);
    await jsonStreamToContentHandler(stream, handler, jsonEncoding);
    if (autoClose) {
        await waitForWritable(output);
    }
}

export async function jsonStringToXmlFile(json: string, targetPath: string, xmlEncoding: BufferEncoding = "utf8"): Promise<void> {
    const output: Writable = createWriteStream(targetPath, { encoding: xmlEncoding });
    try {
        await jsonStringToXmlStream(json, output, xmlEncoding, true);
    } catch (error) {
        output.destroy();
        throw error;
    }
}

export async function jsonFileToXmlFile(path: string, targetPath: string, jsonEncoding?: BufferEncoding, xmlEncoding: BufferEncoding = "utf8"): Promise<void> {
    const output: Writable = createWriteStream(targetPath, { encoding: xmlEncoding });
    try {
        await jsonFileToXmlStream(path, output, jsonEncoding, xmlEncoding, true);
    } catch (error) {
        output.destroy();
        throw error;
    }
}

export async function jsonStreamToXmlFile(stream: Readable, targetPath: string, jsonEncoding: BufferEncoding = "utf8", xmlEncoding: BufferEncoding = "utf8"): Promise<void> {
    const output: Writable = createWriteStream(targetPath, { encoding: xmlEncoding });
    try {
        await jsonStreamToXmlStream(stream, output, jsonEncoding, xmlEncoding, true);
    } catch (error) {
        output.destroy();
        throw error;
    }
}

export function jsonStringToContentHandler(json: string, handler: ContentHandler): void {
    handler.initialize();
    const tokenizer: JsonTokenizer = new JsonTokenizer();
    tokenizer.enqueue(json);
    tokenizer.markFinished();
    const nodeReader: JsonNodeReader = new JsonNodeReader(tokenizer);
    const adapter: JsonToXmlHandler = new JsonToXmlHandler(handler);
    const completed: boolean = processAvailableEvents(nodeReader, adapter);
    if (!completed) {
        throw new Error("Incomplete JSON content");
    }
}

export function jsonFileToContentHandler(path: string, handler: ContentHandler, encoding?: BufferEncoding): void {
    handler.initialize();
    const tokenizer: JsonTokenizer = new JsonTokenizer();
    const nodeReader: JsonNodeReader = new JsonNodeReader(tokenizer);
    const adapter: JsonToXmlHandler = new JsonToXmlHandler(handler);
    const fileReader: FileReader = new FileReader(path, encoding);
    try {
        while (true) {
            const chunk: string = fileReader.read();
            if (chunk.length === 0) {
                break;
            }
            tokenizer.enqueue(chunk);
            processAvailableEvents(nodeReader, adapter);
        }
        tokenizer.markFinished();
        const completed: boolean = processAvailableEvents(nodeReader, adapter);
        if (!completed) {
            throw new Error("Incomplete JSON content in file " + path);
        }
    } finally {
        fileReader.closeFile();
    }
}

export function jsonStreamToContentHandler(stream: Readable, handler: ContentHandler, encoding: BufferEncoding = "utf8"): Promise<void> {
    handler.initialize();
    const tokenizer: JsonTokenizer = new JsonTokenizer();
    const nodeReader: JsonNodeReader = new JsonNodeReader(tokenizer);
    const adapter: JsonToXmlHandler = new JsonToXmlHandler(handler);

    const promise: Promise<void> = new Promise((resolve, reject) => {
        const onData = (chunk: string): void => {
            tokenizer.enqueue(chunk);
            try {
                processAvailableEvents(nodeReader, adapter);
            } catch (error) {
                rejectAndCleanup(error as Error);
            }
        };

        const onEnd = (): void => {
            tokenizer.markFinished();
            try {
                const completed: boolean = processAvailableEvents(nodeReader, adapter);
                if (!completed) {
                    throw new Error("Incomplete JSON stream");
                }
                cleanup();
                resolve();
            } catch (error) {
                rejectAndCleanup(error as Error);
            }
        };

        const onError = (error: Error): void => {
            rejectAndCleanup(error);
        };

        const cleanup = (): void => {
            stream.removeListener("data", onData);
            stream.removeListener("end", onEnd);
            stream.removeListener("error", onError);
        };

        const rejectAndCleanup = (error: Error): void => {
            cleanup();
            reject(error);
        };

        stream.setEncoding(encoding);
        stream.on("data", onData);
        stream.once("end", onEnd);
        stream.once("error", onError);
    });

    return promise;
}

function processAvailableEvents(reader: JsonNodeReader, handler: JsonToXmlHandler): boolean {
    while (true) {
        let event: JsonNodeEvent | undefined;
        try {
            event = reader.readNextEvent();
        } catch (error) {
            if (error instanceof NeedMoreDataError) {
                return false;
            }
            throw error;
        }
        if (event === undefined) {
            return true;
        }
        handler.handleEvent(event);
    }
}

function waitForWritable(stream: Writable): Promise<void> {
    return new Promise((resolve, reject) => {
        if ((stream as unknown as { writableFinished?: boolean }).writableFinished) {
            resolve();
            return;
        }
        const onFinish = (): void => {
            cleanup();
            resolve();
        };
        const onError = (error: Error): void => {
            cleanup();
            reject(error);
        };
        const cleanup = (): void => {
            stream.removeListener("finish", onFinish);
            stream.removeListener("error", onError);
        };
        stream.once("finish", onFinish);
        stream.once("error", onError);
    });
}
