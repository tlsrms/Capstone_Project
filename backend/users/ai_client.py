# -*- coding: utf-8 -*-
# users/ai_client.py
import requests
import json
from django.conf import settings


def analyze_text_with_ai(prompt: str, timeout: int = 300) -> str:
    """
    Call the Ollama server with the given prompt and return the response text.
    Uses streaming for better timeout handling.
    """
    base_url = getattr(settings, "OLLAMA_BASE_URL", "http://localhost:11434")
    model = getattr(settings, "OLLAMA_MODEL_NAME", "llama3")
    url = f"{base_url}/api/generate"
    
    payload = {
        "model": model,
        "prompt": prompt,
        "stream": True,  # 스트리밍 사용
        "options": {
            "num_predict": 500,
            "temperature": 0.7,
        }
    }
    
    print(f"[AI Client] Model: {model}, Prompt length: {len(prompt)} chars")
    
    try:
        response = requests.post(
            url, 
            json=payload, 
            timeout=timeout,
            stream=True
        )
        response.raise_for_status()
        
        # 스트리밍 응답 수집
        full_response = ""
        for line in response.iter_lines():
            if line:
                try:
                    chunk = json.loads(line)
                    if 'response' in chunk:
                        full_response += chunk['response']
                    if chunk.get('done', False):
                        print(f"[AI Client] Done! Response: {len(full_response)} chars")
                        break
                except json.JSONDecodeError:
                    continue
        
        return full_response.strip()
        
    except requests.exceptions.Timeout:
        raise Exception(f"Ollama timeout after {timeout} seconds")
    except requests.exceptions.ConnectionError:
        raise Exception("Cannot connect to Ollama at localhost:11434")
    except Exception as e:
        raise Exception(f"Ollama error: {str(e)}")