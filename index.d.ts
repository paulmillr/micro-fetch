declare type FETCH_OPT = {
    method?: string;
    type?: 'text' | 'json' | 'bytes';
    redirect: boolean;
    status?: number | false;
    headers: Record<string, string>;
    data?: object;
    full: boolean;
    keepalive: boolean;
    cors: boolean;
    referrer: boolean;
    _redirectCnt: number;
};
export default function fetchUrl(url: string, options?: FETCH_OPT): Promise<any>;
export {};
