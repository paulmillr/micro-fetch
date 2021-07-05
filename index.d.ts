export declare type FETCH_OPT = {
    method?: string;
    type?: 'text' | 'json' | 'bytes';
    redirect: boolean;
    expectStatusCode?: number | false;
    headers: Record<string, string>;
    data?: object;
    full: boolean;
    keepAlive: boolean;
    cors: boolean;
    referrer: boolean;
    sslSelfSigned: boolean;
    sslPinCert?: string[];
    _redirectCount: number;
};
export default function fetchUrl(url: string, options?: FETCH_OPT): Promise<any>;
