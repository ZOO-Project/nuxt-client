import type { QuasarPlugins, QuasarIconSets } from 'quasar';

export type QuasarFontIconSet =
    | "bootstrap-icons"
    | "eva-icons"
    | "fontawesome-v5"
    | "fontawesome-v5-pro"
    | "fontawesome-v6"
    | "fontawesome-v6-pro"
    | "ionicons-v4"
    | "line-awesome"
    | "material-icons"
    | "material-icons-outlined"
    | "material-icons-round"
    | "material-icons-sharp"
    | "material-symbols-outlined"
    | "material-symbols-rounded"
    | "material-symbols-sharp"
    | "mdi-v3"
    | "mdi-v4"
    | "mdi-v5"
    | "mdi-v6"
    | "mdi-v7"
    | "themify";

export function defineQuasarConfig(): {
    iconSet: QuasarIconSets;
    plugins: (keyof QuasarPlugins)[];
    extras: { fontIcons: QuasarFontIconSet[] };
    config: {
        loadingBar: { color: string; size: string; position: "top" | "right" | "bottom" | "left" | undefined };
        brand: {
            primary: string;
            secondary: string;
            accent: string;
            dark: string;
            "dark-page": string;
            positive: string;
            negative: string;
            info: string;
            warning: string;
        };
    };
} {
    return {
        plugins: ['LoadingBar', 'Loading', 'Dialog', 'Notify', 'LocalStorage'],
        config: {
            brand: {
                primary: '#663e05',
                secondary: '#fefdeb',
                accent: '#9C27B0',
                dark: '#1D1D1D',
                "dark-page": '#121212',
                positive: '#21BA45',
                negative: '#C10015',
                info: '#31CCEC',
                warning: '#F2C037'
            },
            loadingBar: {
                // same yellow as the Nuxt loading indicator (brand "warning")
                color: 'warning',
                size: '3px',
                position: 'top'
            }
        },
        iconSet: 'material-icons',
        extras: {
            fontIcons: ['mdi-v5'],
        }
    };
}