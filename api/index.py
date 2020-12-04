from _utils.db import get_code_snippet, update_code_snippet, create_code_snippet
from flask import Flask, request
from flask_cors import CORS
import jwt
import os
from uuid import uuid4

app = Flask("Polylang")
CORS(app)

@app.route('/')
@app.route('/api', methods=["GET", "POST"])
def index():
    params = request.json
    if not params: return "JSON error"
    print(params)
    route = params.get("route")
    if route == "get_snippet":
        snippet = get_code_snippet(params['snippet_id'])
        return snippet.to_dict()
    elif route == "new_snippet":
        return new_snippet(params)
    elif route == "update_snippet":
        return update_snippet(params)
    return {'Error': "Route not found."}

def new_snippet(params):
    uid = str(uuid4()).replace('-', '')
    token = createJWT(uid)
    create_code_snippet(uid, params["code"], params["owner"], params["lang"], 
                        params["org"], params["private"])
    return { "id": uid, "token": token }

def update_snippet(params):
    snippet_id = decodeJWT(params["token"])['snippet_id']
    print(snippet_id)
    update_code_snippet(snippet_id, params["code"])
    return "Success"

def createJWT(snippet_id):
    """Create and sign a JWT for guest's to store in their browser.
        This JWT allows them to later edit any snippets they created without having
        to have an account."""
    key = os.environ.get("JWT_SECRET_KEY", "fake_key")
    jwt_res = jwt.encode({"snippet_id": snippet_id}, key, algorithm='HS256')
    return jwt_res.decode("utf-8")

def decodeJWT(token):
    key = os.environ.get("JWT_SECRET_KEY", "fake_key")
    return jwt.decode(token, key, algorithms=['HS256'])