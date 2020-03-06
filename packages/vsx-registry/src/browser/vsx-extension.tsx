/********************************************************************************
 * Copyright (C) 2020 TypeFox and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

import * as React from 'react';
import { injectable, inject } from 'inversify';
import URI from '@theia/core/lib/common/uri';
import { TreeElement } from '@theia/core/lib/browser/source-tree';
import { OpenerService, open, OpenerOptions } from '@theia/core/lib/browser/opener-service';
import { HostedPluginSupport } from '@theia/plugin-ext/lib/hosted/browser/hosted-plugin';
import { PluginServer, PluginMetadata } from '@theia/plugin-ext/lib/common/plugin-protocol';
import { VSXExtensionUri } from '../common/vsx-extension-uri';
import { ProgressService } from '@theia/core/lib/common/progress-service';
import { Endpoint } from '@theia/core/lib/browser/endpoint';

@injectable()
export class VSXExtensionData {
    readonly version?: string;
    readonly iconUrl?: string;
    readonly publisher?: string;
    readonly name?: string;
    readonly displayName?: string;
    readonly description?: string;
    readonly averageRating?: number;
    readonly downloadCount?: number;
    readonly readmeUrl?: string;
    readonly repository?: string;
    readonly license?: string;
    readonly readme?: string;
    static KEYS: Set<(keyof VSXExtensionData)> = new Set([
        'version',
        'iconUrl',
        'publisher',
        'name',
        'displayName',
        'description',
        'averageRating',
        'downloadCount',
        'readmeUrl',
        'repository',
        'license',
        'readme'
    ]);
}

@injectable()
export class VSXExtensionOptions {
    readonly id: string;
}

export const VSXExtensionFactory = Symbol('VSXExtensionFactory');
export type VSXExtensionFactory = (options: VSXExtensionOptions) => VSXExtension;

@injectable()
export class VSXExtension implements VSXExtensionData, TreeElement {

    @inject(VSXExtensionOptions)
    protected readonly options: VSXExtensionOptions;

    @inject(OpenerService)
    protected readonly openerService: OpenerService;

    @inject(HostedPluginSupport)
    protected readonly pluginSupport: HostedPluginSupport;

    @inject(PluginServer)
    protected readonly pluginServer: PluginServer;

    @inject(ProgressService)
    protected readonly progressService: ProgressService;

    protected readonly data: Partial<VSXExtensionData> = {};

    get uri(): URI {
        return VSXExtensionUri.toUri(this.id);
    }

    get id(): string {
        return this.options.id;
    }

    get visible(): boolean {
        return !!this.name;
    }

    get plugin(): PluginMetadata | undefined {
        return this.pluginSupport.getPlugin(this.id);
    }

    get installed(): boolean {
        return !!this.plugin;
    }

    update(data: Partial<VSXExtensionData>): void {
        for (const key of VSXExtensionData.KEYS) {
            if (key in data) {
                Object.assign(this.data, { [key]: data[key] });
            }
        }
    }

    protected getData<K extends keyof VSXExtensionData>(key: K): VSXExtensionData[K] {
        const plugin = this.plugin;
        if (plugin && key in plugin.model) {
            return plugin.model[key as keyof typeof plugin.model] as VSXExtensionData[K];
        }
        return this.data[key];
    }

    get iconUrl(): string | undefined {
        return this.getData('iconUrl');
    }

    get publisher(): string | undefined {
        return this.getData('publisher');
    }

    get name(): string | undefined {
        return this.getData('name');
    }

    get displayName(): string | undefined {
        return this.getData('displayName') || this.name;
    }

    get description(): string | undefined {
        return this.getData('description');
    }

    get version(): string | undefined {
        return this.getData('version');
    }

    get averageRating(): number | undefined {
        return this.getData('averageRating');
    }

    get readmeUrl(): string | undefined {
        const plugin = this.plugin;
        if (plugin && plugin.model.readmeUrl) {
            return new Endpoint({ path: plugin.model.readmeUrl }).getRestUrl().toString();
        }
        return this.data['readmeUrl'];
    }

    get repository(): string | undefined {
        return this.getData('repository');
    }

    get license(): string | undefined {
        return this.getData('license');
    }

    get readme(): string | undefined {
        return this.getData('readme');
    }

    protected _busy = 0;
    get busy(): boolean {
        return !!this._busy;
    }

    async install(): Promise<void> {
        this._busy++;
        try {
            await this.progressService.withProgress(`"Installing '${this.id}' extension...`, 'extensions', () =>
                this.pluginServer.deploy(this.uri.toString())
            );
        } finally {
            this._busy--;
        }
    }

    async uninstall(): Promise<void> {
        this._busy++;
        try {
            await this.progressService.withProgress(`Uninstalling '${this.id}' extension...`, 'extensions', () =>
                this.pluginServer.undeploy(this.id)
            );
        } finally {
            this._busy--;
        }
    }

    async open(options: OpenerOptions = { mode: 'reveal' }): Promise<void> {
        await this.doOpen(this.uri, options);
    }

    async doOpen(uri: URI, options?: OpenerOptions): Promise<void> {
        await open(this.openerService, uri, options);
    }

    render(): React.ReactNode {
        return <VSXExtensionComponent extension={this} />;
    }

    renderEditor(): React.ReactNode {
        return <VSXExtensionEditorComponent extension={this} />;
    }

}

export abstract class AbstractVSXExtensionComponent extends React.Component<AbstractVSXExtensionComponent.Props> {

    readonly install = async () => {
        this.forceUpdate();
        try {
            const pending = this.props.extension.install();
            this.forceUpdate();
            await pending;
        } finally {
            this.forceUpdate();
        }
    };

    readonly uninstall = async () => {
        try {
            const pending = this.props.extension.uninstall();
            this.forceUpdate();
            await pending;
        } finally {
            this.forceUpdate();
        }
    };

    protected renderAction(): React.ReactNode {
        const installed = this.props.extension.installed;
        if (this.props.extension.busy) {
            if (installed) {
                return <button className="theia-button action theia-mod-disabled">Uninstalling</button>;
            }
            return <button className="theia-button action theia-mod-disabled">Installing</button>;
        }
        if (installed) {
            return <button className="theia-button action" onClick={this.uninstall}>Uninstall</button>;
        }
        return <button className="theia-button action" onClick={this.install}>Install</button>;
    }

}
export namespace AbstractVSXExtensionComponent {
    export interface Props {
        extension: VSXExtension
    }
}

export class VSXExtensionComponent extends AbstractVSXExtensionComponent {
    render(): React.ReactNode {
        const { iconUrl, publisher, displayName, description, version } = this.props.extension;
        const iconStyle: React.CSSProperties = {};
        if (iconUrl) {
            iconStyle.backgroundImage = `url('${iconUrl}')`;
        }
        // TODO average rating and download count
        return <div className='theia-vsx-extension'>
            <div className='theia-vsx-extension-icon' style={iconStyle} />
            <div className='theia-vsx-extension-content'>
                <div className='noWrapInfo'>
                    <span className='theia-vsx-extension-name'>{displayName}</span> <span className='theia-vsx-extension-version'>{version}</span>
                </div>
                <div className='noWrapInfo theia-vsx-extension-description'>{description}</div>
                <div className='theia-vsx-extension-action-bar'>
                    <span className='noWrapInfo theia-vsx-extension-publisher'>{publisher}</span>
                    {this.renderAction()}
                </div>
            </div>
        </div >;
    }
}

export class VSXExtensionEditorComponent extends AbstractVSXExtensionComponent {
    render(): React.ReactNode {
        const { id, iconUrl, publisher, displayName, description, averageRating, repository, license, readme } = this.props.extension;
        const iconStyle: React.CSSProperties = {};
        if (iconUrl) {
            iconStyle.backgroundImage = `url('${iconUrl}')`;
        }
        // TODO download count
        // TODO preview, built-in
        // TODO what is clickable?
        return <React.Fragment>
            <div className='header'>
                <div className='icon-container' style={iconStyle} />
                <div className='details'>
                    <div className='title'>
                        <span title='Extension name' className='name'>{displayName}</span> <span title='Extension identifier' className='identifier'>{id}</span>
                    </div>
                    <div className='subtitle'>
                        <span title='Publisher name' className='publisher'>{publisher}</span>
                        {averageRating && <span className='average-rating'>{averageRating}</span>}
                        {repository && <span className='repository'>Repository</span>}
                        {license && <span className='license'>License</span>}
                    </div>
                    <div className='description noWrapInfo'>{description}</div>
                    {this.renderAction()}
                </div>
            </div>
            {readme && <div className='body'
                ref={body => this.body = (body || undefined)}
                onClick={this.openLink}
                dangerouslySetInnerHTML={{ __html: readme }} />}
        </React.Fragment>;
    }

    protected renderStars(): React.ReactNode {
        const rating = this.props.extension.averageRating;
        if (typeof rating !== 'number') {
            return undefined;
        }
        const renderStarAt = (position: number) => position <= rating ?
            <span className='fa fa-star' /> :
            position > rating && position - rating < 1 ?
                <span className='fa fa-star-half-o' /> :
                <span className='fa fa-star-o' />;
        return <span>
            {renderStarAt(1)}{renderStarAt(2)}{renderStarAt(3)}{renderStarAt(4)}{renderStarAt(5)}
        </span>;
    }

    protected body: HTMLElement | undefined;

    // TODO replace with webview
    readonly openLink = (event: React.MouseEvent) => {
        if (!this.body) {
            return;
        }
        const target = event.nativeEvent.target;
        if (!(target instanceof HTMLElement)) {
            return;
        }
        let node = target;
        while (node.tagName.toLowerCase() !== 'a') {
            if (node === this.body) {
                return;
            }
            if (!(node.parentElement instanceof HTMLElement)) {
                return;
            }
            node = node.parentElement;
        }
        const href = node.getAttribute('href');
        if (href && !href.startsWith('#')) {
            event.preventDefault();
            this.props.extension.doOpen(new URI(href));
        }
    };
}
