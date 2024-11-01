import requests
import os

def download_file(file_path, uri):
    try:
        headers = {
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
            'Accept-Encoding': 'gzip, deflate, br, zstd',
            'Accept-Language': 'en-US,en;q=0.9',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'Cookie': 'authToken=9feccbdd-8daa-41e4-80b1-2528875b5c88; authToken.sig=fY1_Ui1YO2SL3qo6cCvcsjpPCrw; _ga_R8DLNV5LWZ=GS1.1.1730490696.1.0.1730490696.0.0.0; _ga=GA1.2.2123656417.1730490697; _gid=GA1.2.1829217426.1730490697; __stripe_mid=68b879aa-f786-4853-9e08-760ad5e83033691c86; __stripe_sid=93a70e8f-1973-4aac-863d-cc7d537b97028f92ad; _gat_gtag_UA_115781850_1=1',
            'Host': 'reeves.tx.publicsearch.us',
            'If-None-Match': '"87-8vUAd8oTw/9DZQZkWb4ge8Lh+aY"',
            'Referer': 'https://reeves.tx.publicsearch.us/doc/47054591',
            'Sec-CH-UA': '"Google Chrome";v="129", "Not=A?Brand";v="8", "Chromium";v="129"',
            'Sec-CH-UA-Mobile': '?0',
            'Sec-CH-UA-Platform': '"macOS"',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'same-origin',
            'Sec-Fetch-User': '?1',
            'Upgrade-Insecure-Requests': '1',
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36'
        }

        # Make a GET request to the URI
        response = requests.get(uri, headers=headers, stream=True)

        # Check if the request was successful
        if response.status_code == 200:
            # Create the directory if it doesn't exist
            os.makedirs(os.path.dirname(file_path), exist_ok=True)

            # Open the file in binary write mode and write the content
            with open(file_path, 'wb') as file:
                for chunk in response.iter_content(chunk_size=8192):
                    file.write(chunk)
            print(f"Downloaded: {file_path}")
        else:
            print(f"Failed to download file: {response.status_code} - {response.reason}")
    except Exception as e:
        print(f"An error occurred: {e}")

# Example usage
download_file('data/31275654/29704042_1.png', 'https://reeves.tx.publicsearch.us/files/documents/31275654/images/29704042_1.png')
