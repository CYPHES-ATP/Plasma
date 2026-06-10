import path from "node:path"
import { access, mkdir, writeFile } from "node:fs/promises"
import { DEFAULT_CONFIG } from "./config"

const STARTER_CONTRACT = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract Starter is Ownable {
    string public message;

    event MessageUpdated(string message);

    constructor(address initialOwner) Ownable(initialOwner) {}

    function setMessage(string calldata newMessage) external onlyOwner {
        message = newMessage;
        emit MessageUpdated(newMessage);
    }
}
`

const STARTER_TEST = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Starter} from "../contracts/Starter.sol";

contract StarterTest {
    function testOwnerCanSetMessage() public {
        Starter starter = new Starter(address(this));
        starter.setMessage("hello plasma");
        require(
            keccak256(bytes(starter.message())) == keccak256(bytes("hello plasma")),
            "message was not updated"
        );
    }
}
`

const OPENZEPPELIN_OWNABLE = `// SPDX-License-Identifier: MIT
// OpenZeppelin Contracts (last updated v5.0.0) (access/Ownable.sol)
pragma solidity ^0.8.20;

abstract contract Ownable {
    address private _owner;

    error OwnableUnauthorizedAccount(address account);
    error OwnableInvalidOwner(address owner);

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    constructor(address initialOwner) {
        if (initialOwner == address(0)) revert OwnableInvalidOwner(address(0));
        _transferOwnership(initialOwner);
    }

    modifier onlyOwner() {
        if (msg.sender != _owner) revert OwnableUnauthorizedAccount(msg.sender);
        _;
    }

    function owner() public view virtual returns (address) {
        return _owner;
    }

    function transferOwnership(address newOwner) public virtual onlyOwner {
        if (newOwner == address(0)) revert OwnableInvalidOwner(address(0));
        _transferOwnership(newOwner);
    }

    function renounceOwnership() public virtual onlyOwner {
        _transferOwnership(address(0));
    }

    function _transferOwnership(address newOwner) internal virtual {
        address oldOwner = _owner;
        _owner = newOwner;
        emit OwnershipTransferred(oldOwner, newOwner);
    }
}
`

const FOUNDRY_CONFIG = `[profile.default]
src = "contracts"
test = "test"
script = "script"
libs = ["lib"]
solc_version = "0.8.26"
optimizer = true
optimizer_runs = 200
`

const FILES: Record<string, string> = {
  "contracts/Starter.sol": STARTER_CONTRACT,
  "test/Starter.t.sol": STARTER_TEST,
  "plasma.json": `${JSON.stringify(DEFAULT_CONFIG, null, 2)}\n`,
  ".gitignore": ".plasma/\nout/\ncache/\nbroadcast/\n.env\n",
  "foundry.toml": FOUNDRY_CONFIG,
  "remappings.txt": "@openzeppelin/=lib/openzeppelin-contracts/\n",
  "lib/openzeppelin-contracts/contracts/access/Ownable.sol": OPENZEPPELIN_OWNABLE,
  "lib/openzeppelin-contracts/NOTICE":
    "OpenZeppelin Contracts subset, MIT licensed. https://openzeppelin.com/contracts/\n",
}

async function exists(file: string) {
  try {
    await access(file)
    return true
  } catch {
    return false
  }
}

export async function initializeProject(directory: string) {
  const conflicts: string[] = []
  for (const name of Object.keys(FILES)) {
    if (await exists(path.join(directory, name))) conflicts.push(name)
  }
  if (conflicts.length > 0) {
    throw new Error(`Plasma will not overwrite existing files:\n- ${conflicts.join("\n- ")}`)
  }

  await Promise.all(
    ["contracts", "test", "script", "lib"].map((name) => mkdir(path.join(directory, name), { recursive: true })),
  )
  for (const [name, content] of Object.entries(FILES)) {
    const file = path.join(directory, name)
    await mkdir(path.dirname(file), { recursive: true })
    await writeFile(file, content, { encoding: "utf8", flag: "wx" })
  }

  return {
    directory,
    files: Object.keys(FILES),
  }
}
