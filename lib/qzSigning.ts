// @ts-nocheck
/**
 * Firmado de mensajes para QZ Tray.
 *
 * QZ Tray muestra el diálogo "Untrusted website" en cada impresión cuando los
 * mensajes no están firmados. Para suprimirlo se firma cada mensaje con una
 * clave privada RSA-2048, usando el certificado autofirmado de Bistro POS.
 *
 * Modelo de confianza:
 *  - La CLAVE PRIVADA vive aquí, embebida en el frontend. Es la misma para todos
 *    los usuarios y dispositivos. El firmado ocurre en el navegador (Web Crypto),
 *    por lo que funciona OFFLINE (requisito del POS).
 *  - El CERTIFICADO PÚBLICO se confía una vez por equipo:
 *      · QZ normal: el usuario marca "Allow" + "Remember this decision" la 1ª vez.
 *      · Instalador personalizado (provisioning): cero diálogos desde el inicio.
 *
 * Nota de seguridad: exponer la clave privada en el cliente es el tradeoff
 * conocido del firmado client-side de QZ. Es aceptable para un POS local porque
 * la clave solo sirve para firmar mensajes hacia QZ Tray en el propio equipo.
 */

// Certificado público autofirmado (válido 20 años). Se entrega a QZ Tray para
// identificar el origen de los mensajes.
const QZ_CERTIFICATE = `-----BEGIN CERTIFICATE-----
MIIDdTCCAl2gAwIBAgIUGi5qQU2Cg8hUXzZLLCbL7lliAoUwDQYJKoZIhvcNAQEL
BQAwSjETMBEGA1UEAwwKQmlzdHJvIFBPUzETMBEGA1UECgwKQmlzdHJvIFBPUzER
MA8GA1UECwwIUHJpbnRpbmcxCzAJBgNVBAYTAkNPMB4XDTI2MDYwNDE5MTk1N1oX
DTQ2MDUzMDE5MTk1N1owSjETMBEGA1UEAwwKQmlzdHJvIFBPUzETMBEGA1UECgwK
QmlzdHJvIFBPUzERMA8GA1UECwwIUHJpbnRpbmcxCzAJBgNVBAYTAkNPMIIBIjAN
BgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAs51V4e1YOrrS1NcC9/jn38YvH3mh
nl0UhcBx5Tx/EF17BRlGNw0EmARyHF4CqdT1zksx79hHnapw/7KnCZLjzP/YQAKD
P0ZRyunKQ1EE0OojnaD5OyyWTwkiR6nBr+1K4KeN5yAx6VMPrk/TelzCGQyacN9b
MNfvzv6wo0PwS44xBKoQS1q0rKgTf6HtguyojyxdNeqcGL7raRHl+mQO3FjRHu2S
0SODSAhyk6xEf0gUQAEHhPsSu11Xc9nssPAG+loKznhJO8BPlg+uMi5i9nQh/RzW
HPcpbBbihRx3LZu1awkr5Z/Z/stboOwGwz8BA6RZkdzPFKQdRHdgECBIhwIDAQAB
o1MwUTAdBgNVHQ4EFgQU1w1m8oj3n4QgYgg8xFHgkQZfpVYwHwYDVR0jBBgwFoAU
1w1m8oj3n4QgYgg8xFHgkQZfpVYwDwYDVR0TAQH/BAUwAwEB/zANBgkqhkiG9w0B
AQsFAAOCAQEAfkB4LLJi3ESOfzDwKPotaaCo41tQkXMaLgLbGQ2MVeaNpq2TkOXs
yZ6ZSGWS60l0CMvZZS0x7mm5D2Myr301ejYtnDpur3C+cs52g1xnzd+IOhQEBiqK
85Gw4yLsPskNFLQkPlqUdZDCOOK+IOH2Eslg2S3Km9pNuctIszOfmdBOQrnAmtEc
/eqH3eOCB8ygdgAlBtejxqfBPAiIPjkXAcXlKoZMV58EXLa8Qlp6GBlW44XO6ahB
CAHqW3iVXXUsntFJ76GuloZ1/xFotfNRSyfWvU8xkeMlMssIV0V8rtkMKbM6KKwk
uEaogm6T9slndDBDAn/s9GZUrRq4oa2A2g==
-----END CERTIFICATE-----`;

// Clave privada PKCS#8 usada para firmar los mensajes (RSASSA-PKCS1-v1_5 + SHA-512).
const QZ_PRIVATE_KEY = `-----BEGIN PRIVATE KEY-----
MIIEvAIBADANBgkqhkiG9w0BAQEFAASCBKYwggSiAgEAAoIBAQCznVXh7Vg6utLU
1wL3+Offxi8feaGeXRSFwHHlPH8QXXsFGUY3DQSYBHIcXgKp1PXOSzHv2EedqnD/
sqcJkuPM/9hAAoM/RlHK6cpDUQTQ6iOdoPk7LJZPCSJHqcGv7Urgp43nIDHpUw+u
T9N6XMIZDJpw31sw1+/O/rCjQ/BLjjEEqhBLWrSsqBN/oe2C7KiPLF016pwYvutp
EeX6ZA7cWNEe7ZLRI4NICHKTrER/SBRAAQeE+xK7XVdz2eyw8Ab6WgrOeEk7wE+W
D64yLmL2dCH9HNYc9ylsFuKFHHctm7VrCSvln9n+y1ug7AbDPwEDpFmR3M8UpB1E
d2AQIEiHAgMBAAECggEAO1Ug9qXhvFzUomx4VZPKfPhJvrr+MYML8Xb16MTIMI7A
wZlswWiyeMkXLNm9RX7MyB283D70wVd5Rm4skZQNXj2xoMtzsaY4BLCgGQadcam2
pC51xh9fc7JPuZ6RFd1sG7Qdwxi2hB3lEy7ZbBVSJNYt+lU+GW9rj1RA413g9gPu
qzRPTh64auRT32RQoio8j60sH+dLZb50jzNY5oYiQsLLdWjBRKO2mEit6fIXPiGL
idjVYszjl/r+nERvujjOeg0g7P59FmlQY/2cA+5qk+3XghkCEJeEp3faWkpQDYEo
nBwRbbHdUMprQUCsEi9E6ZH84Gi3YfTcicf6todfyQKBgQD1GpMX2n4dJx5Pya9X
fn910bHvBqOAg05SKveM/+M5I1quBsREAS4J9bgzj7m/ZjE21pHgro79PrNO0yUq
CXVQfWzlHKPbP1TI8FrlTRNLR1ncwmLuMpjY8npOXvsQepTJcPm/rE7hmKskeplW
QCt6Dptrx97E05zLP5z7mYOJKwKBgQC7mXSDIatPhgy0rzeJlWEXtYv7KWhYJq0y
wlfiQbyf7owwQ9owv5rnPDWRCcnyLmaItF1vYGrBPzzw2zpD1biAjkQ6HXHIx53U
/Adk8YRaVmv555obQ7YfxJaP18srRNbE2DiIMWDT2hLIGtFwKXNMAuUeDdliiyUd
FSFKGW4YFQKBgFtE7gkv305TxsHHRHe8LxJcZ3muayvruTp3rX7fumkIdTfgZS09
kzs6OMFaf7x5/VGCTQfxeGVs97Aeh/RDWWADlI0sQQffaV75wZ8pOEoL47aE2/n+
9VOz1z9ftvXH76ejXhy1uRngk7odvQOVGZt13QIhhx6b/gLhST+XRpfJAoGAOPPF
Y2n9UA8qHFB1U9d9umzrKjzP6LMVMau+cnnygbsx5BU1UEdbB4hH2thV7qgXiLj5
BK8IudIw9g4YCi//60dFfz8hJAs150r8E7EetS43aY7eQhi0WcCc1N52V5R2fxwF
TZNwCeDSgt1hZ+OtlQ3r8MvTiw8jHUkk6hH+UmECgYAzh7xiEZMo22uaxkmcLOa5
9aDdI2eA2N9eoH1rNh8isbmShMN2Nl+fBlLLLlsMleLB6PfdsdnNFHnQzn4AngWX
t1aazk5iM5HYcnhuBnAtNSPj32vVIsGMXIRGGFaCpulLPJkdrfYvTAFezjQ/ELms
AnUT7Amggc3PjT6IQvBnbg==
-----END PRIVATE KEY-----`;

const pemToArrayBuffer = (pem: string): ArrayBuffer => {
    const b64 = pem
        .replace(/-----BEGIN [^-]+-----/, '')
        .replace(/-----END [^-]+-----/, '')
        .replace(/\s+/g, '');
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes.buffer;
};

// Importa la clave una sola vez y la reutiliza en cada firma.
let signingKeyPromise: Promise<CryptoKey> | null = null;
const getSigningKey = (): Promise<CryptoKey> => {
    if (!signingKeyPromise) {
        signingKeyPromise = crypto.subtle.importKey(
            'pkcs8',
            pemToArrayBuffer(QZ_PRIVATE_KEY),
            { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-512' },
            false,
            ['sign']
        );
    }
    return signingKeyPromise;
};

const signMessage = async (toSign: string): Promise<string> => {
    const key = await getSigningKey();
    const signature = await crypto.subtle.sign(
        'RSASSA-PKCS1-v1_5',
        key,
        new TextEncoder().encode(toSign)
    );
    let binary = '';
    const bytes = new Uint8Array(signature);
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
};

/**
 * Configura QZ Tray para firmar todos los mensajes con el certificado de Bistro.
 * Llamar UNA vez antes de cualquier operación de QZ.
 */
export const setupQzSecurity = (qz: any): void => {
    // Se entrega el certificado al iniciar la conexión WebSocket.
    qz.security.setCertificatePromise((resolve: any) => {
        resolve(QZ_CERTIFICATE);
    });

    // QZ llama esto en cada print/función y espera la firma del mensaje.
    qz.security.setSignatureAlgorithm('SHA512');
    qz.security.setSignaturePromise((toSign: string) => (resolve: any, reject: any) => {
        signMessage(toSign).then(resolve).catch(reject);
    });
};
