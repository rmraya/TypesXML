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

import { existsSync } from "node:fs";
import { basename, dirname, isAbsolute, resolve } from "node:path";
import { DOMBuilder } from "./DOMBuilder";
import { SAXParser } from "./SAXParser";
import { XMLAttribute } from "./XMLAttribute";
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
        if (!isAbsolute(catalogFile)) {
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
        this.workDir = dirname(catalogFile);
        this.base = '';

        let contentHandler: DOMBuilder = new DOMBuilder();
        let parser: SAXParser = new SAXParser();
        parser.setContentHandler(contentHandler);
        parser.parseFile(catalogFile);
        let catalogDocument: XMLDocument | undefined = contentHandler.getDocument();
        if (!catalogDocument) {
            throw new Error('Catalog file ' + catalogFile + ' is empty');
        }
        let catalogRoot: XMLElement | undefined = catalogDocument.getRoot();
        if (!catalogRoot) {
            throw new Error('Catalog file ' + catalogFile + ' is empty');
        }
        if (catalogRoot.getName() !== 'catalog') {
            throw new Error('Catalog root element must be <catalog>');
        }
        this.recurse(catalogRoot);
    }

    recurse(catalogRoot: XMLElement) {
        for (let child of catalogRoot.getChildren()) {
            let currentBase: string = this.base;
            let xmlBase: XMLAttribute | undefined = child.getAttribute("xml:base");
            if (xmlBase) {
                this.base = xmlBase.getValue();
                if (!this.base.endsWith('/')) {
                    this.base += '/';
                }
                if (!isAbsolute(this.base)) {
                    this.base = resolve(this.workDir, this.base);
                }
                if (!existsSync(this.base)) {
                    throw new Error('Invalid xml:base: ' + this.base);
                }
            }
            if (child.getName() === 'public') {
                let publicIdAttribute: XMLAttribute | undefined = child.getAttribute("publicId");
                if (!publicIdAttribute) {
                    throw new Error('publicId attribute is required for <public>');
                }
                let publicId: string = publicIdAttribute.getValue();
                if (publicId.startsWith("urn:publicid:")) {
                    publicId = this.unwrapUrn(publicId);
                }
                if (!this.publicCatalog.has(publicId)) {
                    let uriAttribute: XMLAttribute | undefined = child.getAttribute("uri");
                    if (!uriAttribute) {
                        throw new Error('uri attribute is required for <public>');
                    }
                    let uri: string = this.makeAbsolute(uriAttribute.getValue());
                    if (existsSync(uri)) {
                        this.publicCatalog.set(publicId, uri);
                        if (uri.endsWith(".dtd") || uri.endsWith(".ent") || uri.endsWith(".mod")) {
                            let name: string = basename(uri);
                            if (!this.dtdCatalog.has(name)) {
                                this.dtdCatalog.set(name, uri);
                            }
                        }
                    }
                }
            }
            if (child.getName() === 'system') {
                let uriAttribute: XMLAttribute | undefined = child.getAttribute("uri");
                if (!uriAttribute) {
                    throw new Error('uri attribute is required for <system>');
                }
                let uri: string = this.makeAbsolute(uriAttribute.getValue());
                if (existsSync(uri)) {
                    let systemId: XMLAttribute | undefined = child.getAttribute("systemId");
                    if (!systemId) {
                        throw new Error('systemId attribute is required for <system>');
                    }
                    this.systemCatalog.set(systemId.getValue(), uri);
                    if (uri.endsWith(".dtd")) {
                        let name: string = basename(uri);
                        if (!this.dtdCatalog.has(name)) {
                            this.dtdCatalog.set(name, uri);
                        }
                    }
                }
            }
            if (child.getName() === 'uri') {
                let uriAttribute: XMLAttribute | undefined = child.getAttribute("uri");
                if (!uriAttribute) {
                    throw new Error('uri attribute is required for <uri>');
                }
                let uri: string = this.makeAbsolute(uriAttribute.getValue());
                if (existsSync(uri)) {
                    let nameAttribute: XMLAttribute | undefined = child.getAttribute("name");
                    if (!nameAttribute) {
                        throw new Error('name attribute is required for <uri>');
                    }
                    this.uriCatalog.set(nameAttribute.getValue(), uri);
                    if (uri.endsWith(".dtd") || uri.endsWith(".ent") || uri.endsWith(".mod")) {
                        let name: string = basename(uri);
                        if (!this.dtdCatalog.has(name)) {
                            this.dtdCatalog.set(name, uri);
                        }
                    }
                }
            }
            if (child.getName() === 'rewriteURI') {
                let rewritePrefix: XMLAttribute | undefined = child.getAttribute("rewritePrefix");
                if (!rewritePrefix) {
                    throw new Error('rewritePrefix attribute is required for <rewriteURI>');
                }
                let uri: string = this.makeAbsolute(rewritePrefix.getValue());
                let uriStartString: XMLAttribute | undefined = child.getAttribute("uriStartString");
                if (!uriStartString) {
                    throw new Error('uriStartString attribute is required for <rewriteURI>');
                }
                let pair: string[] = [uriStartString.getValue(), uri];
                if (!this.uriRewrites.includes(pair)) {
                    this.uriRewrites.push(pair);
                }
            }
            if (child.getName() === 'rewriteSystem') {
                let rewritePrefix: XMLAttribute | undefined = child.getAttribute("rewritePrefix");
                if (!rewritePrefix) {
                    throw new Error('rewritePrefix attribute is required for <rewriteSystem>');
                }
                let uri: string = this.makeAbsolute(rewritePrefix.getValue());
                let systemIdStartString: XMLAttribute | undefined = child.getAttribute("systemIdStartString");
                if (!systemIdStartString) {
                    throw new Error('systemIdStartString attribute is required for <rewriteSystem>');
                }
                let pair: string[] = [systemIdStartString.getValue(), uri];
                if (!this.systemRewrites.includes(pair)) {
                    this.systemRewrites.push(pair);
                }
            }
            if (child.getName() === 'nextCatalog') {
                let catalogAttribute: XMLAttribute | undefined = child.getAttribute("catalog");
                if (!catalogAttribute) {
                    throw new Error('catalog attribute is required for <nextCatalog>');
                }
                let nextCatalog: string = this.makeAbsolute(catalogAttribute.getValue());
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
        if (!isAbsolute(file)) {
            if (this.base !== '') {
                return resolve(this.base, uri);
            }
            return resolve(this.workDir, uri);
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

    resolveEntity(publicId: string, systemId: string): string | undefined {
        if (publicId) {
            let location: string | undefined = this.matchPublic(publicId);
            if (location) {
                return location;
            }
        }
        return this.matchSystem(systemId);
    }

    matchSystem(systemId: string): string | undefined {
        if (systemId) {
            for (let pair of this.systemRewrites) {
                if (systemId.startsWith(pair[0])) {
                    systemId = pair[1] + systemId.substring(pair[0].length);
                }
            }
            if (this.systemCatalog.has(systemId)) {
                return this.systemCatalog.get(systemId);
            }
            let fileName: string = basename(systemId);
            if (this.dtdCatalog.has(fileName)) {
                return this.dtdCatalog.get(fileName);
            }
        }
        return undefined;
    }

    matchPublic(publicId: string): string | undefined {
        if (publicId.startsWith("urn:publicid:")) {
            publicId = this.unwrapUrn(publicId);
        }
        if (this.publicCatalog.has(publicId)) {
            return this.publicCatalog.get(publicId);
        }
        return undefined;
    }

    matchURI(uri: string): string | undefined {
        if (uri) {
            // Apply URI rewrites first
            for (let pair of this.uriRewrites) {
                if (uri.startsWith(pair[0])) {
                    uri = pair[1] + uri.substring(pair[0].length);
                }
            }
            // Look up in URI catalog
            if (this.uriCatalog.has(uri)) {
                return this.uriCatalog.get(uri);
            }
        }
        return undefined;
    }
}


