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

import { existsSync } from "fs";
import * as path from "node:path";
import { ContentHandler } from "./ContentHandler";
import { DOMBuilder } from "./DOMBuilder";
import { SAXParser } from "./SAXParser";
import { XMLDocument } from "./XMLDocument";
import { XMLElement } from "./XMLElement";
import { XMLUtils } from "./XMLUtils";

export class Catalog {

    systemCatalog: Map<string, string>;
    publicCatalog: Map<string, string>;
    uriCatalog: Map<string, string>;
    dtdCatalog: Map<string, string>;

    uriRewrites: Array<string[]>;
    systemRewrites: Array<string[]>;
    workDir: string;
    base: string;

    constructor(catalogFile: string) {
        if (!path.isAbsolute(catalogFile)) {
            throw new Error('Catalog file must be absolute: ' + catalogFile);
        }
        if (!existsSync(catalogFile)) {
            throw new Error('Catalog file ' + catalogFile + ' not found');
        }

        this.systemCatalog = new Map<string, string>();
        this.publicCatalog = new Map<string, string>();
        this.uriCatalog = new Map<string, string>();
        this.dtdCatalog = new Map<string, string>();
        this.uriRewrites = new Array<string[]>();
        this.systemRewrites = new Array<string[]>();
        this.workDir = path.dirname(catalogFile);
        this.base = '';

        let contentHandler: ContentHandler = new DOMBuilder();
        let parser: SAXParser = new SAXParser();
        parser.setContentHandler(contentHandler);
        parser.parseFile(catalogFile);
        let catalogDocument: XMLDocument = (contentHandler as DOMBuilder).getDocument();
        let catalogRoot: XMLElement = catalogDocument.getRoot();
        if (catalogRoot.getName() !== 'catalog') {
            throw new Error('Catalog root element must be <catalog>');
        }
        this.recurse(catalogRoot);
    }

    recurse(catalogRoot: XMLElement) {
        for (let child of catalogRoot.getChildren()) {
            let currentBase: string = this.base;
            if (child.hasAttribute('xml:base') && child.getAttribute("xml:base").getValue() !== '') {
                this.base = child.getAttribute("xml:base").getValue();
                if (!this.base.endsWith('/')) {
                    this.base += '/';
                }
                if (!path.isAbsolute(this.base)) {
                    this.base = path.resolve(this.workDir, this.base);
                }
                if (!existsSync(this.base)) {
                    throw new Error('Invalid xml:base: ' + this.base);
                }
            }
            if (child.getName() === 'public') {
                let publicId: string = child.getAttribute("publicId").getValue();
                if (publicId.startsWith("urn:publicid:")) {
                    publicId = this.unwrapUrn(publicId);
                }
                if (!this.publicCatalog.has(publicId)) {
                    let uri: string = this.makeAbsolute(child.getAttribute("uri").getValue());
                    if (existsSync(uri)) {
                        this.publicCatalog.set(publicId, uri);
                        if (uri.endsWith(".dtd") || uri.endsWith(".ent") || uri.endsWith(".mod")) {
                            let name: string = path.basename(uri);
                            if (!this.dtdCatalog.has(name)) {
                                this.dtdCatalog.set(name, uri);
                            }
                        }
                    }
                }
            }
            if (child.getName() === 'system') {
                let uri: string = this.makeAbsolute(child.getAttribute("uri").getValue());
                if (existsSync(uri)) {
                    this.systemCatalog.set(child.getAttribute("systemId").getValue(), uri);
                    if (uri.endsWith(".dtd")) {
                        let name: string = path.basename(uri);
                        if (!this.dtdCatalog.has(name)) {
                            this.dtdCatalog.set(name, uri);
                        }
                    }
                }
            }
            if (child.getName() === 'uri') {
                let uri: string = this.makeAbsolute(child.getAttribute("uri").getValue());
                if (existsSync(uri)) {
                    this.uriCatalog.set(child.getAttribute("name").getValue(), uri);
                    if (uri.endsWith(".dtd") || uri.endsWith(".ent") || uri.endsWith(".mod")) {
                        let name: string = path.basename(uri);
                        if (!this.dtdCatalog.has(name)) {
                            this.dtdCatalog.set(name, uri);
                        }
                    }
                }
            }
            if (child.getName() === 'rewriteURI') {
                let uri: string = this.makeAbsolute(child.getAttribute("rewritePrefix").getValue());
                let pair: string[] = [child.getAttribute("uriStartString").getValue(), uri];
                if (!this.uriRewrites.includes(pair)) {
                    this.uriRewrites.push(pair);
                }
            }
            if (child.getName() === 'rewriteSystem') {
                let uri: string = this.makeAbsolute(child.getAttribute("rewritePrefix").getValue());
                let pair: string[] = [child.getAttribute("systemIdStartString").getValue(), uri];
                if (!this.systemRewrites.includes(pair)) {
                    this.systemRewrites.push(pair);
                }
            }
            if (child.getName() === 'nextCatalog') {
                let nextCatalog: string = this.makeAbsolute(child.getAttribute("catalog").getValue());
                let catalog: Catalog = new Catalog(nextCatalog);
                let map: Map<string, string> = catalog.getSystemCatalog();
                map.forEach((value, key) => {
                    if (!this.systemCatalog.has(key)) {
                        this.systemCatalog.set(key, value);
                    }
                });
                map = catalog.getPublicCatalog();
                map.forEach((value, key) => {
                    if (!this.publicCatalog.has(key)) {
                        this.publicCatalog.set(key, value);
                    }
                });
                map = catalog.getUriCatalog();
                map.forEach((value, key) => {
                    if (!this.uriCatalog.has(key)) {
                        this.uriCatalog.set(key, value);
                    }
                });
                map = catalog.getDtdCatalog();
                map.forEach((value, key) => {
                    if (!this.dtdCatalog.has(key)) {
                        this.dtdCatalog.set(key, value);
                    }
                });
                let array: Array<string[]> = catalog.getUriRewrites();
                array.forEach((value) => {
                    if (!this.uriRewrites.includes(value)) {
                        this.uriRewrites.push(value);
                    }
                });
                array = catalog.getSystemRewrites();
                array.forEach((value) => {
                    if (!this.systemRewrites.includes(value)) {
                        this.systemRewrites.push(value);
                    }
                });
            }
            this.recurse(child);
            this.base = currentBase;
        }
    }

    makeAbsolute(uri: string): string {
        let file: string = this.base + uri;
        if (!path.isAbsolute(file)) {
            if (this.base !== '') {
                return path.resolve(this.base, uri);
            }
            return path.resolve(this.workDir, uri);
        }
        return this.base + uri;
    }

    unwrapUrn(urn: string): string {
        if (!urn.startsWith('urn:publicid:')) {
            return urn;
        }
        let publicId: string = urn.trim().substring('urn:publicid:'.length);
        publicId = XMLUtils.replaceAll(publicId, '+', ' ');
        publicId = XMLUtils.replaceAll(publicId, ':', '//');
        publicId = XMLUtils.replaceAll(publicId, ';', '::');
        publicId = XMLUtils.replaceAll(publicId, '%2B', '+');
        publicId = XMLUtils.replaceAll(publicId, '%3A', ':');
        publicId = XMLUtils.replaceAll(publicId, '%2F', '/');
        publicId = XMLUtils.replaceAll(publicId, '%3B', ';');
        publicId = XMLUtils.replaceAll(publicId, '%27', '\'');
        publicId = XMLUtils.replaceAll(publicId, '%3F', '?');
        publicId = XMLUtils.replaceAll(publicId, '%23', '#');
        return XMLUtils.replaceAll(publicId, '%25', '%');
    }

    getSystemCatalog(): Map<string, string> {
        return this.systemCatalog;
    }

    getPublicCatalog(): Map<string, string> {
        return this.publicCatalog;
    }

    getUriCatalog(): Map<string, string> {
        return this.uriCatalog;
    }

    getDtdCatalog(): Map<string, string> {
        return this.dtdCatalog;
    }

    getUriRewrites(): Array<string[]> {
        return this.uriRewrites;
    }

    getSystemRewrites(): Array<string[]> {
        return this.systemRewrites;
    }

    resolveEntity(publicId: string, systemId: string): string {
        if (publicId) {
            let location: string = this.matchPublic(publicId);
            if (location) {
                return location;
            }
        }
        let location: string = this.matchSystem(systemId);
        if (location) {
            return location;
        }
        return undefined;
    }

    matchSystem(systemId: string): string {
        if (systemId) {
            for (let pair of this.systemRewrites) {
                if (systemId.startsWith(pair[0])) {
                    systemId = pair[1] + systemId.substring(pair[0].length);
                }
            }
            if (this.systemCatalog.has(systemId)) {
                return this.systemCatalog.get(systemId);
            }
            let fileName: string = path.basename(systemId);
            if (this.dtdCatalog.has(fileName)) {
                return this.dtdCatalog.get(fileName);
            }
        }
        return undefined;
    }

    matchPublic(publicId: string): string {
        if (publicId.startsWith("urn:publicid:")) {
            publicId = this.unwrapUrn(publicId);
        }
        if (this.publicCatalog.has(publicId)) {
            return this.publicCatalog.get(publicId);
        }
        return undefined;
    }
}


